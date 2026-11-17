import { query } from "./db";
export async function expireStreams() {
  await query(
    "UPDATE SesionCamara s SET expira_en=now() WHERE auth_session_id IS NULL OR NOT EXISTS(SELECT 1 FROM hg_sessions a JOIN Usuario u ON u.id=a.user_id JOIN hg_memberships m ON m.user_id=a.user_id AND m.household_id=a.household_id WHERE a.id=s.auth_session_id AND a.household_id=s.household_id AND a.user_id=s.usuario_id AND a.revoked_at IS NULL AND a.expires_at>now() AND u.activo AND m.enabled AND m.role IN ('ADMINISTRADOR','RESIDENTE'))",
  );
  for (const row of (
    await query(
      "SELECT id,media_id,tipo FROM SesionCamara WHERE expira_en<=now()",
    )
  ).rows) {
    if (row.media_id) {
      try {
        const r = await fetch(
          (process.env.MEDIA_API || "http://127.0.0.1:9997") +
            (row.tipo === "process"
              ? "/v3/rtspconns/kick/"
              : "/v3/webrtcsessions/kick/") +
            encodeURIComponent(row.media_id),
          { method: "POST", signal: AbortSignal.timeout(2000) },
        );
        if (!r.ok && r.status !== 404) continue;
      } catch {
        continue;
      }
    }
    await query("DELETE FROM SesionCamara WHERE id=$1 AND expira_en<=now()", [
      row.id,
    ]);
  }
}
