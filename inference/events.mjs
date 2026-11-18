const featureByCategory = {
  person: "people",
  cat: "pets",
  dog: "pets",
  resident: "faces",
  unknown: "faces",
  standing: "posture",
  sitting: "posture",
  motion: "motion",
};
export async function storeEvent(pool, j, d) {
  if (
    !Number.isFinite(d.score) ||
    d.score < 0 ||
    d.score > 1 ||
    !Object.hasOwn(featureByCategory, d.category)
  )
    return;
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const camera = (
      await c.query(
        "SELECT id,household_id,detection_revision,detection_settings FROM Camara WHERE id=$1 AND household_id=$2 AND enabled FOR UPDATE",
        [j.camara_id, j.household_id],
      )
    ).rows[0];
    if (
      !camera ||
      camera.detection_revision !== j.revision ||
      !camera.detection_settings[featureByCategory[d.category]]
    ) {
      await c.query("ROLLBACK");
      return;
    }
    const authorized = await c.query(
      "SELECT 1 FROM SesionCamara s JOIN hg_sessions a ON a.id=s.auth_session_id JOIN hg_memberships m ON m.user_id=s.usuario_id AND m.household_id=s.household_id WHERE s.id=$1 AND s.tipo='process' AND s.camara_id=$4 AND s.household_id=$3 AND s.expira_en>now() AND a.revoked_at IS NULL AND a.expires_at>now() AND m.enabled AND m.role IN ('ADMINISTRADOR','RESIDENTE') AND EXISTS(SELECT 1 FROM SesionCamara WHERE id=$2 AND tipo='publish' AND camara_id=$4 AND household_id=$3 AND expira_en>now())",
      [j.id, j.publisher, camera.household_id, camera.id],
    );
    if (!authorized.rowCount) {
      await c.query("ROLLBACK");
      return;
    }
    const profile = d.category === "resident" ? d.profileId : null;
    if (
      profile &&
      !(
        await c.query(
          "SELECT 1 FROM PerfilFacial WHERE id=$1 AND household_id=$2",
          [profile, camera.household_id],
        )
      ).rowCount
    ) {
      await c.query("ROLLBACK");
      return;
    }
    if (
      !(
        await c.query(
          "SELECT 1 FROM EventoCamara WHERE camara_id=$1 AND categoria=$2 AND perfil_id IS NOT DISTINCT FROM $3 AND track_key IS NOT DISTINCT FROM $4 AND fecha>now()-interval '30 seconds'",
          [j.camara_id, d.category, profile, d.trackKey ?? null],
        )
      ).rowCount
    ) {
      await c.query(
        "INSERT INTO EventoCamara(camara_id,categoria,confianza,perfil_id,track_key) VALUES($1,$2,$3,$4,$5)",
        [j.camara_id, d.category, d.score, profile, d.trackKey ?? null],
      );
      if (d.category === "unknown")
        await c.query(
          "INSERT INTO AlertaCorrelacionada(titulo,severidad,regla_disparadora,modo_hogar_id,household_id) SELECT 'Rostro desconocido detectado','WARNING','Cámara: rostro desconocido confirmado',id,$1 FROM ModoHogar WHERE household_id=$1 AND activo AND modo_actual='AWAY' ORDER BY fecha_activacion DESC LIMIT 1",
          [camera.household_id],
        );
    }
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
