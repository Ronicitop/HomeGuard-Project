import { withTransaction } from "./transaction";
import { hashPassword, hashLegacyPassword } from "../auth/passwordService";
import { DEMO_HOME } from "../config";
export async function seedDemo() {
  return withTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(716403993)");
    const existing = (await tx.query("SELECT id,password_hash FROM Usuario"))
      .rows;
    let converted = 0;
    for (const u of existing)
      if (!u.password_hash.startsWith("$")) {
        await tx.query("UPDATE Usuario SET password_hash=$2 WHERE id=$1", [
          u.id,
          await hashLegacyPassword(u.password_hash),
        ]);
        converted++;
      }
    const user =
      (
        await tx.query(
          "SELECT id FROM Usuario WHERE lower(email)='admin@homeguard.local'",
        )
      ).rows[0] ||
      (
        await tx.query(
          "INSERT INTO Usuario(nombre,apellido,email,password_hash) VALUES('Admin','Local','admin@homeguard.local',$1) RETURNING id",
          [
            await hashPassword(
              process.env.HG_DEMO_ADMIN_PASSWORD || "HomeGuard2026!",
            ),
          ],
        )
      ).rows[0];
    for (const [name, description] of [
      ["ADMINISTRADOR", "Administración"],
      ["RESIDENTE", "Residente"],
      ["INVITADO", "Resumen"],
    ])
      await tx.query(
        "INSERT INTO Rol(nombre,descripcion) VALUES($1,$2) ON CONFLICT(nombre) DO NOTHING",
        [name, description],
      );
    await tx.query(
      "INSERT INTO RolUsuario(usuario_id,rol_id) SELECT $1,id FROM Rol WHERE nombre='ADMINISTRADOR' ON CONFLICT DO NOTHING",
      [user.id],
    );
    await tx.query(
      "INSERT INTO hg_memberships(household_id,user_id,role) VALUES($1,$2,'ADMINISTRADOR') ON CONFLICT DO NOTHING",
      [DEMO_HOME, user.id],
    );
    await tx.query(
      "INSERT INTO DispositivoESP32(device_id,nombre,zona,usuario_id,household_id) VALUES('esp32_central_01','Central simulada','Hogar',$1,$2) ON CONFLICT DO NOTHING",
      [user.id, DEMO_HOME],
    );
    await tx.query(
      "INSERT INTO ConfiguracionUmbral(tipo_sensor,valor_minimo,valor_maximo,unidad,usuario_id,household_id) SELECT 'temperatura',0,40,'C',$1,$2 WHERE NOT EXISTS(SELECT 1 FROM ConfiguracionUmbral WHERE household_id=$2 AND tipo_sensor='temperatura')",
      [user.id, DEMO_HOME],
    );
    for (const [code, name, type, state] of [
      ["ACT_SIRENA_01", "Sirena simulada", "SIRENA", "OFF"],
      ["ACT_RELE_01", "Relé simulado", "RELE", "ON"],
      ["ACT_VALVULA_01", "Válvula simulada", "VALVULA", "ON"],
    ])
      await tx.query(
        "INSERT INTO Actuador(device_id,codigo,nombre,tipo,estado_actual,usuario_id,household_id) VALUES('esp32_central_01',$1,$2,$3,$4,$5,$6) ON CONFLICT(codigo) DO NOTHING",
        [code, name, type, state, user.id, DEMO_HOME],
      );
    for (const [sensor, label, room, x, y] of [
      ["puerta", "Puerta principal", "Entrada", 18, 78],
      ["movimiento", "Sensor PIR", "Sala", 20, 35],
      ["temperatura", "Temperatura", "Pasillo", 52, 35],
      ["humo", "Humo", "Cocina", 80, 30],
      ["agua", "Agua", "Lavandería", 80, 75],
    ])
      await tx.query(
        "INSERT INTO DispositivoUbicacion2D(device_id,tipo_sensor,etiqueta,zona_habitacion,pos_x,pos_y,household_id) VALUES('esp32_central_01',$1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [sensor, label, room, x, y, DEMO_HOME],
      );
    return { converted_passwords: converted };
  });
}
