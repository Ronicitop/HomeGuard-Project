import { randomUUID } from "node:crypto";
import pool from "../db";
import { withTransaction } from "../db/transaction";
import { type AuthContext, assertPermission } from "../auth/permissions";
import { fail } from "../http/errors";
import { audit, emit } from "../audit/auditService";
import { idempotent } from "../http/idempotency";
import { enqueueJob } from "../jobs/outboxService";
export async function getMode(ctx: AuthContext) {
  assertPermission(ctx, "mode.read");
  return (
    (
      await pool.query(
        "SELECT mode,revision,updated_at FROM hg_modes WHERE household_id=$1",
        [ctx.household_id],
      )
    ).rows[0] || { mode: "AWAY", revision: 0 }
  );
}
export async function setMode(
  ctx: AuthContext,
  mode: string,
  expectedRevision: number,
) {
  assertPermission(ctx, "mode.update");
  if (!["HOME", "AWAY", "DISARMED"].includes(mode))
    fail(400, "INVALID_MODE", "Modo no válido.");
  return withTransaction(async (tx) => {
    const before = (
      await tx.query(
        "SELECT * FROM hg_modes WHERE household_id=$1 FOR UPDATE",
        [ctx.household_id],
      )
    ).rows[0];
    if (!before || before.revision !== expectedRevision)
      fail(409, "REVISION_CONFLICT", "El modo cambió. Actualizá el panel.");
    const after = (
      await tx.query(
        "UPDATE hg_modes SET mode=$2,revision=revision+1,updated_at=now() WHERE household_id=$1 RETURNING mode,revision,updated_at",
        [ctx.household_id, mode],
      )
    ).rows[0];
    await tx.query(
      "UPDATE ModoHogar SET activo=false WHERE household_id=$1 AND activo",
      [ctx.household_id],
    );
    await tx.query(
      "INSERT INTO ModoHogar(modo_actual,activo,usuario_id,household_id) VALUES($1,true,$2,$3)",
      [mode, ctx.user_id, ctx.household_id],
    );
    await audit(
      tx,
      ctx,
      "mode.changed",
      ctx.household_id,
      { mode: before.mode },
      { mode },
    );
    await emit(tx, ctx.household_id, "health.updated", "mode");
    await enqueueJob(tx, {
      household_id: ctx.household_id,
      kind: "CONFIG",
      payload: { reason: "mode.changed", revision: after.revision },
      idempotency_key: `${ctx.household_id}:mode:${after.revision}`,
    });
    return after;
  });
}
export async function requestActuatorCommand(
  ctx: AuthContext,
  input: {
    code: string;
    state: string;
    event_id?: string;
    idempotency_key: string;
  },
) {
  assertPermission(ctx, "actuators.command");
  if (!["ON", "OFF"].includes(input.state))
    fail(400, "INVALID_COMMAND", "Estado no válido.");
  return withTransaction(async (tx) =>
    idempotent(
      tx,
      ctx,
      "actuator.command",
      input.idempotency_key,
      {
        code: input.code,
        state: input.state,
        event_id: input.event_id || null,
      },
      async () => {
        const target = (
          await tx.query(
            "SELECT * FROM Actuador WHERE codigo=$1 AND household_id=$2",
            [input.code, ctx.household_id],
          )
        ).rows[0];
        if (!target) fail(404, "NOT_FOUND", "No se encontró el actuador.");
        if (
          input.event_id &&
          !(
            await tx.query(
              "SELECT 1 FROM hg_events WHERE id=$1 AND household_id=$2",
              [input.event_id, ctx.household_id],
            )
          ).rowCount
        )
          fail(404, "NOT_FOUND", "No se encontró el evento.");
        const command = (
          await tx.query(
            "INSERT INTO hg_actuator_commands(id,household_id,legacy_code,requested_state,source,event_id,idempotency_key) VALUES($1,$2,$3,$4,'MANUAL_WEB',$5,$6) RETURNING *",
            [
              randomUUID(),
              ctx.household_id,
              input.code,
              input.state,
              input.event_id || null,
              `${ctx.household_id}:${ctx.user_id}:${input.idempotency_key}`,
            ],
          )
        ).rows[0];
        await enqueueJob(tx, {
          household_id: ctx.household_id,
          event_id: input.event_id,
          kind: "ACTUATOR",
          payload: {
            command_id: command.id,
            code: input.code,
            state: input.state,
            transport: "SIMULATED",
          },
          idempotency_key: `${command.id}:ACTUATOR`,
        });
        await audit(tx, ctx, "actuator.requested", command.id, null, {
          code: input.code,
          state: input.state,
          transport: "SIMULATED",
        });
        await emit(tx, ctx.household_id, "health.updated", "actuators");
        return command;
      },
    ),
  );
}
export async function receiveActuatorAck(
  ack: { command_id: string; state: string; confirmation_source: string },
  householdId: string,
) {
  if (
    ack.confirmation_source !== "SIMULATOR" ||
    !["ON", "OFF"].includes(ack.state)
  )
    fail(422, "INVALID_ACK", "Confirmación no válida.");
  return withTransaction(async (tx) => {
    const before = (
      await tx.query(
        "SELECT * FROM hg_actuator_commands WHERE id=$1 AND household_id=$2 FOR UPDATE",
        [ack.command_id, householdId],
      )
    ).rows[0];
    if (!before) fail(404, "NOT_FOUND", "No se encontró el comando.");
    if (before.requested_state !== ack.state)
      fail(
        409,
        "ACK_STATE_MISMATCH",
        "La confirmación no coincide con lo solicitado.",
      );
    if (before.status === "CONFIRMED") return before;
    if (before.status !== "REQUESTED")
      fail(409, "COMMAND_CLOSED", "El comando ya terminó.");
    const updated = (
      await tx.query(
        "UPDATE hg_actuator_commands SET status='CONFIRMED',confirmed_state=$2,confirmation_source='SIMULATOR',ack_at=now() WHERE id=$1 RETURNING *",
        [ack.command_id, ack.state],
      )
    ).rows[0];
    await tx.query(
      "UPDATE Actuador SET estado_actual=$1,ultima_activacion=now() WHERE codigo=$2 AND household_id=$3",
      [ack.state, before.legacy_code, householdId],
    );
    await emit(tx, householdId, "health.updated", "actuators");
    return updated;
  });
}
export async function requestAutomaticCommand(
  event: any,
  code: string,
  state: "ON" | "OFF",
) {
  return withTransaction(async (tx) => {
    const key = `${event.id}:${code}:${state}`;
    const target = (
      await tx.query(
        "SELECT 1 FROM Actuador WHERE codigo=$1 AND household_id=$2",
        [code, event.household_id],
      )
    ).rowCount;
    if (!target)
      fail(404, "ACTUATOR_UNAVAILABLE", "El actuador no está configurado.");
    const cmd = (
      await tx.query(
        "INSERT INTO hg_actuator_commands(id,household_id,legacy_code,requested_state,source,event_id,idempotency_key) VALUES($1,$2,$3,$4,'AUTO_EVENT',$5,$6) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key RETURNING *",
        [randomUUID(), event.household_id, code, state, event.id, key],
      )
    ).rows[0];
    await enqueueJob(tx, {
      household_id: event.household_id,
      event_id: event.id,
      kind: "ACTUATOR",
      payload: { command_id: cmd.id, code, state, transport: "SIMULATED" },
      idempotency_key: `${cmd.id}:ACTUATOR`,
    });
    return cmd;
  });
}
