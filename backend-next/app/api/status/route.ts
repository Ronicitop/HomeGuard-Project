import { currentUser } from '../../../lib/auth';
import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { obtenerModoActual } from '../../../lib/mqttWorker';



const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function GET() {
    const session = await currentUser();
    if (!session) return NextResponse.json({error:'Sesión requerida'},{status:401});
    if (!session.permisos.includes('VISUALIZAR_DASHBOARD')) return NextResponse.json({error:'Acceso denegado'},{status:403});
  try {
    const resModo = await query(
      `SELECT modo_actual FROM ModoHogar WHERE activo = TRUE ORDER BY fecha_activacion DESC LIMIT 1`
    );
    const modoVigente = resModo.rows[0]?.modo_actual || obtenerModoActual();

    const resTelemetria = await query(`
      SELECT DISTINCT ON (tipo_sensor) 
        id, device_id, tipo_sensor, valor_numerico, estado_texto, unidad, fecha_registro
      FROM TelemetriaSensor
      ORDER BY tipo_sensor, fecha_registro DESC;
    `);

    const resAlertas = await query(`
      SELECT id, titulo, severidad, regla_disparadora, fecha_hora 
      FROM AlertaCorrelacionada 
      WHERE resuelta = FALSE 
      ORDER BY fecha_hora DESC LIMIT 100;
    `);

    // Datos Sprint 3: Energía, Plano 2D y Actuadores
    const resEnergia = await query(`
      SELECT voltaje_v, corriente_a, potencia_w, energia_kwh, fecha_registro
      FROM ConsumoElectrico
      ORDER BY fecha_registro DESC LIMIT 1;
    `);

    const resPlano2D = await query(`
      SELECT id, device_id, tipo_sensor, etiqueta, zona_habitacion, pos_x, pos_y
      FROM DispositivoUbicacion2D
      ORDER BY id ASC;
    `);

    const resActuadores = await query(`
      SELECT id, device_id, codigo, nombre, tipo, estado_actual, ultima_activacion
      FROM Actuador
      ORDER BY id ASC;
    `);

    return NextResponse.json({
      modo: modoVigente,
      alertasActivas: resAlertas.rows.length,
      dispositivos: resTelemetria.rows,
      alertasRecientes: resAlertas.rows,
      energia: resEnergia.rows[0] || { voltaje_v: 220, corriente_a: 3.5, potencia_w: 770, energia_kwh: 14.5 },
      plano2D: resPlano2D.rows,
      actuadores: resActuadores.rows
    }, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    console.error('[API /api/status] Error:', error.message);
    return NextResponse.json({ error: 'Error al consultar estado' }, { status: 500, headers: corsHeaders });
  }
}