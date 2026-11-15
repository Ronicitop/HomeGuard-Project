import type { PoolClient } from "pg";
import { fail } from "../http/errors";
export async function tableAvailable(
  tx: Pick<PoolClient, "query">,
  table: string,
): Promise<boolean> {
  return Boolean(
    (await tx.query("SELECT to_regclass($1) AS t", [table])).rows[0].t,
  );
}
export async function loadRuleContext(
  tx: PoolClient,
  householdId: string,
  cameraId: string,
  versionId: string,
) {
  for (const table of ["hg_cameras", "hg_rules", "hg_rule_versions"])
    if (!(await tableAvailable(tx, table)))
      fail(
        503,
        "VISION_NOT_INSTALLED",
        "La mitad A todavía no está conectada.",
      );
  const row = (
    await tx.query(
      "SELECT to_jsonb(c) camera,to_jsonb(r) rule,to_jsonb(v) version FROM hg_rule_versions v JOIN hg_rules r ON r.id=v.rule_id AND r.household_id=$1 JOIN hg_cameras c ON c.id=$2 AND c.household_id=$1 WHERE v.id=$3",
      [householdId, cameraId, versionId],
    )
  ).rows[0];
  if (
    !row ||
    row.version.household_id !== householdId ||
    row.version.definition.camera_id !== cameraId ||
    row.camera.deleted_at
  )
    fail(
      404,
      "RULE_CONTEXT_NOT_FOUND",
      "La cámara y la regla no corresponden al hogar.",
    );
  if (
    !row.version.definition?.actions ||
    !row.version.definition?.condition ||
    !Array.isArray(row.version.definition?.modes)
  )
    fail(
      503,
      "INVALID_RULE_CONFIGURATION",
      "La configuración de observación requiere revisión.",
    );
  return row;
}
// A registers these ports from its integration module; absence is an explicit error, never fake evidence.
export interface VisionPorts {
  recordClipResult(result: unknown): Promise<unknown>;
  upsertEncounter(message: unknown): Promise<unknown>;
}
let ports: VisionPorts | null = null;
export function registerVisionPorts(value: VisionPorts) {
  ports = value;
}
export function requireVisionPorts(): VisionPorts {
  if (!ports)
    fail(
      503,
      "VISION_HANDLER_UNAVAILABLE",
      "El procesador de evidencia de la mitad A no está disponible.",
    );
  return ports;
}
