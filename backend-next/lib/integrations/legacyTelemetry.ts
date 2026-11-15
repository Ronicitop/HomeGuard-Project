import { randomUUID } from "node:crypto";
import { z } from "zod";
import pool from "../db";
import { withTransaction } from "../db/transaction";
import { fail } from "../http/errors";
import { emit } from "../audit/auditService";
import { enqueueJob } from "../jobs/outboxService";
import { requestAutomaticCommand } from "../actuators/commandService";
import { ingestDetection } from "../events/eventIngestor";
const telemetry = z
  .object({
    message_id: z.uuid(),
    device_id: z.string().min(1).max(50),
    source: z.literal("SIMULATED"),
    sensor: z
      .enum(["puerta", "movimiento", "humo", "temperatura", "agua"])
      .optional(),
    state: z.string().max(50).optional(),
    valor: z.number().finite().optional(),
    unidad: z.string().max(20).optional(),
    energy: z
      .object({
        voltaje_v: z.number().min(0).max(1000),
        corriente_a: z.number().min(0).max(1000),
        potencia_w: z.number().min(0).max(100000),
        energia_kwh: z.number().min(0).max(1e9),
      })
      .strict()
      .optional(),
  })
  .strict();
export async function recordTelemetry(home: string, raw: unknown) {
  const input = telemetry.parse(raw);
  const result = await withTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${home}:iot:${input.device_id}`,
    ]);
    if (
      !(
        await tx.query(
          "SELECT 1 FROM DispositivoESP32 WHERE household_id=$1 AND device_id=$2",
          [home, input.device_id],
        )
      ).rowCount
    )
      fail(404, "DEVICE_NOT_FOUND", "El dispositivo no corresponde al hogar.");
    if (
      !(
        await tx.query(
          "INSERT INTO hg_iot_inbox(message_id,household_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING message_id",
          [input.message_id, home],
        )
      ).rowCount
    )
      return { duplicate: true, events: [] };
    const mode =
      (
        await tx.query("SELECT mode FROM hg_modes WHERE household_id=$1", [
          home,
        ])
      ).rows[0]?.mode || "AWAY";
    let telemetryId = null;
    const candidates: {
      type: string;
      title: string;
      severity: string;
      commands: [string, "ON" | "OFF"][];
    }[] = [];
    if (input.energy) {
      const e = input.energy;
      await tx.query(
        "INSERT INTO ConsumoElectrico(device_id,voltaje_v,corriente_a,potencia_w,energia_kwh,source) VALUES($1,$2,$3,$4,$5,'SIMULATED')",
        [
          input.device_id,
          e.voltaje_v,
          e.corriente_a,
          e.potencia_w,
          e.energia_kwh,
        ],
      );
      if (e.potencia_w > 3500)
        candidates.push({
          type: "IOT_OVERLOAD",
          title: "Simulación: potencia superior al umbral de 3500 W.",
          severity: "WARNING",
          commands: [],
        });
    } else {
      if (!input.sensor || !input.state)
        fail(422, "INVALID_TELEMETRY", "Se necesita sensor y estado.");
      telemetryId = (
        await tx.query(
          "INSERT INTO TelemetriaSensor(device_id,tipo_sensor,valor_numerico,estado_texto,unidad,source) VALUES($1,$2,$3,$4,$5,'SIMULATED') RETURNING id",
          [
            input.device_id,
            input.sensor,
            input.valor ?? null,
            input.state,
            input.unidad || null,
          ],
        )
      ).rows[0].id;
      await tx.query(
        "INSERT INTO hg_sensor_signals(household_id,device_id,sensor_type,state,source) VALUES($1,$2,$3,$4,'SIMULATED')",
        [home, input.device_id, input.sensor, input.state],
      );
      const signals = (
        await tx.query(
          "SELECT DISTINCT ON(sensor_type) sensor_type,state FROM hg_sensor_signals WHERE household_id=$1 AND device_id=$2 AND occurred_at>now()-interval '15 seconds' ORDER BY sensor_type,occurred_at DESC,id DESC",
          [home, input.device_id],
        )
      ).rows;
      const latest = Object.fromEntries(
        signals.map((x) => [x.sensor_type, x.state]),
      );
      if (
        mode === "AWAY" &&
        ["puerta", "movimiento"].includes(input.sensor) &&
        latest.puerta === "OPEN" &&
        ["MOTION_DETECTED", "DETECTADO"].includes(latest.movimiento)
      )
        candidates.push({
          type: "IOT_INTRUSION",
          title: "Simulación: puerta abierta y movimiento en modo Ausencia.",
          severity: "CRITICAL",
          commands: [["ACT_SIRENA_01", "ON"]],
        });
      if (
        mode === "HOME" &&
        input.sensor === "puerta" &&
        input.state === "OPEN"
      )
        candidates.push({
          type: "IOT_DOOR",
          title: "Simulación: acceso abierto en modo En casa.",
          severity: "WARNING",
          commands: [],
        });
      const temp = (
        await tx.query(
          "SELECT valor_numerico FROM TelemetriaSensor WHERE device_id=$1 AND tipo_sensor='temperatura' AND fecha_registro>now()-interval '15 seconds' ORDER BY id DESC LIMIT 1",
          [input.device_id],
        )
      ).rows[0]?.valor_numerico;
      const threshold =
        (
          await tx.query(
            "SELECT valor_maximo FROM ConfiguracionUmbral WHERE household_id=$1 AND tipo_sensor='temperatura' ORDER BY actualizado_en DESC LIMIT 1",
            [home],
          )
        ).rows[0]?.valor_maximo ?? 40;
      if (
        ["humo", "temperatura"].includes(input.sensor) &&
        ["SMOKE_DETECTED", "DETECTADO"].includes(latest.humo) &&
        temp > Number(threshold)
      )
        candidates.push({
          type: "IOT_FIRE",
          title: "Simulación: humo y temperatura elevada.",
          severity: "CRITICAL",
          commands: [
            ["ACT_SIRENA_01", "ON"],
            ["ACT_RELE_01", "OFF"],
          ],
        });
      if (
        input.sensor === "agua" &&
        ["WATER_LEAK", "FUGA_DETECTADA"].includes(input.state)
      )
        candidates.push({
          type: "IOT_WATER",
          title: "Simulación: fuga de agua.",
          severity: "WARNING",
          commands: [["ACT_VALVULA_01", "OFF"]],
        });
    }
    await tx.query(
      "UPDATE DispositivoESP32 SET ultimo_heartbeat=now() WHERE device_id=$1",
      [input.device_id],
    );
    const events: any[] = [];
    for (const c of candidates) {
      const cool = (
        await tx.query(
          "SELECT 1 FROM hg_iot_cooldowns WHERE household_id=$1 AND device_id=$2 AND event_type=$3 AND until_at>now()",
          [home, input.device_id, c.type],
        )
      ).rowCount;
      if (cool) continue;
      const event = (
        await tx.query(
          'INSERT INTO hg_events(id,household_id,source,category,event_type,severity,summary,occurred_at,decisions,producer) VALUES($1,$2,\'SIMULATED\',\'SECURITY\',$3,$4,$5,now(),$6,\'{"name":"legacy-iot-adapter","version":"1.0"}\') RETURNING *',
          [
            randomUUID(),
            home,
            c.type,
            c.severity,
            c.title,
            JSON.stringify({
              notify_requested: true,
              clip_requested: false,
              source: "SIMULATED",
              mode,
            }),
          ],
        )
      ).rows[0];
      const alert = (
        await tx.query(
          "INSERT INTO AlertaCorrelacionada(titulo,severidad,regla_disparadora,telemetria_origen_id,household_id) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [c.title, c.severity, c.type, telemetryId, home],
        )
      ).rows[0];
      await tx.query("INSERT INTO hg_legacy_event_map VALUES($1,$2)", [
        event.id,
        alert.id,
      ]);
      await tx.query(
        "INSERT INTO hg_iot_cooldowns VALUES($1,$2,$3,now()+interval '30 seconds') ON CONFLICT(household_id,device_id,event_type) DO UPDATE SET until_at=excluded.until_at",
        [home, input.device_id, c.type],
      );
      await enqueueJob(tx, {
        household_id: home,
        event_id: event.id,
        kind: "PUSH",
        payload: {},
        idempotency_key: `${event.id}:PUSH`,
      });
      // Commands are separate durable jobs; absent configured actuators are never presented as active.
      for (const [code, state] of c.commands)
        if (
          (
            await tx.query(
              "SELECT 1 FROM Actuador WHERE household_id=$1 AND codigo=$2",
              [home, code],
            )
          ).rowCount
        ) {
          const id = randomUUID();
          await tx.query(
            "INSERT INTO hg_actuator_commands(id,household_id,legacy_code,requested_state,source,event_id,idempotency_key) VALUES($1,$2,$3,$4,'AUTO_EVENT',$5,$6)",
            [id, home, code, state, event.id, `${event.id}:${code}`],
          );
          await enqueueJob(tx, {
            household_id: home,
            event_id: event.id,
            kind: "ACTUATOR",
            payload: { command_id: id, code, state, transport: "SIMULATED" },
            idempotency_key: `${id}:ACTUATOR`,
          });
        }
      await emit(tx, home, "event.created", event.id);
      events.push(event);
    }
    await emit(tx, home, "health.updated", "telemetry");
    return { duplicate: false, events };
  });
  const pending = (
    await pool.query(
      "SELECT visual_candidate FROM hg_pending_correlations WHERE household_id=$1 AND device_id=$2 AND state='PENDING' AND expires_at>=now()",
      [home, input.device_id],
    )
  ).rows;
  for (const p of pending) await ingestDetection(p.visual_candidate, home);
  return result;
}
