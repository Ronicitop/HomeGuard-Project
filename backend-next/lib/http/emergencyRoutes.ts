import { z } from "zod";
import pool from "../db";
import { withTransaction } from "../db/transaction";
import { type AuthContext, assertPermission } from "../auth/permissions";
import { body, json, uuid, revision } from "./response";
import { fail } from "./errors";
import { audit, emit } from "../audit/auditService";
import { enqueueJob } from "../jobs/outboxService";
import { getIncident, respondIncident } from "../emergencies/incidentService";
import {
  acceptSimulatedCall,
  closeIncident,
} from "../emergencies/simulatedCallService";
import { readCallAudio } from "../emergencies/voiceService";
const profileSchema = z
  .object({
    contact_name: z.string().trim().min(2).max(100),
    address: z.string().trim().min(5).max(300),
    access_notes: z.string().max(500).default(""),
    contacts: z
      .array(
        z
          .object({
            name: z.string().min(2).max(100),
            phone: z.string().min(3).max(40),
          })
          .strict(),
      )
      .max(5),
    fictitious_data_confirmed: z.literal(true),
    expected_revision: revision,
  })
  .strict();
export async function emergencyRoutes(
  request: Request,
  p: string[],
  ctx: AuthContext,
): Promise<Response | null> {
  const method = request.method,
    path = p.join("/");
  if (path === "emergency-profile") {
    assertPermission(ctx, "emergencies.configure");
    if (method === "GET") {
      const row = (
        await pool.query(
          "SELECT data,version FROM hg_emergency_profiles WHERE household_id=$1",
          [ctx.household_id],
        )
      ).rows[0];
      return json(
        row
          ? { ...row.data, revision: row.version }
          : {
              revision: 0,
              contact_name: "",
              address: "",
              access_notes: "",
              contacts: [],
              fictitious_data_confirmed: false,
            },
      );
    }
    if (method === "PUT") {
      const input = await body(request, profileSchema),
        { expected_revision, ...data } = input;
      const result = await withTransaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `${ctx.household_id}:emergency-profile`,
        ]);
        const old = (
          await tx.query(
            "SELECT * FROM hg_emergency_profiles WHERE household_id=$1",
            [ctx.household_id],
          )
        ).rows[0];
        if ((old?.version || 0) !== expected_revision)
          fail(409, "REVISION_CONFLICT", "El perfil cambió. Volvé a cargarlo.");
        const row = (
          await tx.query(
            "INSERT INTO hg_emergency_profiles(household_id,data,updated_by) VALUES($1,$2,$3) ON CONFLICT(household_id) DO UPDATE SET data=excluded.data,version=hg_emergency_profiles.version+1,updated_by=excluded.updated_by,updated_at=now() RETURNING version",
            [ctx.household_id, JSON.stringify(data), ctx.user_id],
          )
        ).rows[0];
        await audit(
          tx,
          ctx,
          "emergency.profile_changed",
          ctx.household_id,
          null,
          { revision: row.version },
        );
        return { ...data, revision: row.version };
      });
      return json(result);
    }
  }
  if (path === "emergency-policy") {
    assertPermission(
      ctx,
      method === "GET" ? "emergencies.read" : "emergencies.configure",
    );
    if (method === "GET")
      return json(
        (
          await pool.query(
            "SELECT * FROM hg_emergency_policies WHERE household_id=$1",
            [ctx.household_id],
          )
        ).rows[0] || {
          enabled: false,
          immobility_seconds: 10,
          response_seconds: 20,
          transport: "SIMULATED",
          revision: 0,
        },
      );
    if (method === "PUT") {
      const input = await body(
        request,
        z
          .object({
            enabled: z.boolean(),
            immobility_seconds: z.number().int().min(5).max(120),
            response_seconds: z.number().int().min(10).max(300),
            transport: z.literal("SIMULATED"),
            expected_revision: revision,
          })
          .strict(),
      );
      const result = await withTransaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `${ctx.household_id}:emergency-policy`,
        ]);
        const old = (
          await tx.query(
            "SELECT * FROM hg_emergency_policies WHERE household_id=$1 FOR UPDATE",
            [ctx.household_id],
          )
        ).rows[0];
        if ((old?.revision || 0) !== input.expected_revision)
          fail(
            409,
            "REVISION_CONFLICT",
            "La política cambió. Volvé a cargarla.",
          );
        const profile = (
          await tx.query(
            "SELECT data FROM hg_emergency_profiles WHERE household_id=$1",
            [ctx.household_id],
          )
        ).rows[0]?.data;
        if (
          input.enabled &&
          (!profile?.fictitious_data_confirmed ||
            !profile.address ||
            !profile.contact_name)
        )
          fail(
            422,
            "EMERGENCY_PROFILE_REQUIRED",
            "Guardá primero un perfil ficticio confirmado.",
          );
        const row = (
          await tx.query(
            "INSERT INTO hg_emergency_policies(household_id,enabled,immobility_seconds,response_seconds) VALUES($1,$2,$3,$4) ON CONFLICT(household_id) DO UPDATE SET enabled=excluded.enabled,immobility_seconds=excluded.immobility_seconds,response_seconds=excluded.response_seconds,revision=hg_emergency_policies.revision+1 RETURNING *",
            [
              ctx.household_id,
              input.enabled,
              input.immobility_seconds,
              input.response_seconds,
            ],
          )
        ).rows[0];
        if (!input.enabled) {
          await tx.query(
            "UPDATE hg_outbox SET status='CANCELLED',error_code='POLICY_DISABLED' WHERE household_id=$1 AND kind IN ('EMERGENCY','ALARM') AND status='QUEUED'",
            [ctx.household_id],
          );
          await tx.query(
            "UPDATE hg_emergency_incidents SET state='NEEDS_REVIEW',state_revision=state_revision+1 WHERE household_id=$1 AND state IN ('PENDING_RESPONSE','ESCALATED')",
            [ctx.household_id],
          );
        }
        await enqueueJob(tx, {
          household_id: ctx.household_id,
          kind: "CONFIG",
          payload: {
            reason: "emergency-policy.changed",
            revision: row.revision,
          },
          idempotency_key: `${ctx.household_id}:emergency-policy:${row.revision}`,
        });
        await audit(
          tx,
          ctx,
          "emergency.policy_changed",
          ctx.household_id,
          old,
          row,
        );
        await emit(tx, ctx.household_id, "emergency.updated", "policy");
        return row;
      });
      return json(result);
    }
  }
  if (p[0] === "emergencies") {
    assertPermission(ctx, "emergencies.read");
    if (p.length === 1 && method === "GET") {
      const items = (
        await pool.query(
          "SELECT i.id,i.event_id,i.state,i.state_revision,i.response_deadline,i.created_at,i.cancellation_requested,e.summary,e.source,to_jsonb(c) AS call FROM hg_emergency_incidents i JOIN hg_events e ON e.id=i.event_id LEFT JOIN LATERAL(SELECT id,state,audio_status FROM hg_simulated_calls WHERE incident_id=i.id)c ON true WHERE i.household_id=$1 ORDER BY i.created_at DESC LIMIT 100",
          [ctx.household_id],
        )
      ).rows;
      return json({ items, next_cursor: null });
    }
    if (p.length >= 2) {
      const id = uuid.parse(p[1]);
      if (
        p[2] === "simulated-call" &&
        p[3] === "audio" &&
        p.length === 4 &&
        method === "GET"
      ) {
        assertPermission(ctx, "demo.operator");
        return new Response(
          new Uint8Array(await readCallAudio(id, ctx.household_id)),
          {
            headers: {
              "Content-Type": "audio/wav",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      }
      if (p.length === 2 && method === "GET")
        return json(await getIncident(ctx, id));
      if (p[2] === "respond" && p.length === 3 && method === "POST") {
        const input = await body(
          request,
          z
            .object({
              response: z.enum(["I_AM_OK", "REQUEST_HELP"]),
              expected_revision: revision,
            })
            .strict(),
        );
        return json(
          await respondIncident(
            ctx,
            id,
            input,
            request.headers.get("idempotency-key") || "",
          ),
        );
      }
      if (
        p[2] === "simulated-call" &&
        p[3] === "accept" &&
        p.length === 4 &&
        method === "POST"
      ) {
        const input = await body(
          request,
          z.object({ expected_revision: revision }).strict(),
        );
        return json(
          await acceptSimulatedCall(ctx, id, input.expected_revision),
        );
      }
      if (p[2] === "close" && p.length === 3 && method === "POST") {
        const input = await body(
          request,
          z.object({ expected_revision: revision }).strict(),
        );
        return json(await closeIncident(ctx, id, input.expected_revision));
      }
    }
  }
  return null;
}
