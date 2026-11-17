import { currentUser } from '../../../../lib/auth';
import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db';

const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
    const session = await currentUser();
    if (!session) return NextResponse.json({error:'Sesión requerida'},{status:401});
    if (!session.permisos.includes('CONTROL_DISPOSITIVOS')) return NextResponse.json({error:'Acceso denegado'},{status:403});
  try {
    const res = await query(`
      SELECT 
        device_id, 
        nombre, 
        zona, 
        direccion_mac, 
        ip_local, 
        activo, 
        ultimo_heartbeat,
        CASE 
          WHEN ultimo_heartbeat IS NOT NULL AND ultimo_heartbeat >= NOW() - INTERVAL '60 SECONDS' THEN 'EN_LINEA'
          ELSE 'FUERA_DE_LINEA'
        END AS estado_conexion
      FROM DispositivoESP32
      ORDER BY device_id ASC;
    `);
    return NextResponse.json(res.rows, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Error al consultar dispositivos' }, { status: 500, headers: corsHeaders });
  }
}