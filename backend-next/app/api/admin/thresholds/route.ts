import { currentUser } from '../../../../lib/auth';
import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db';

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
    if (!session.permisos.includes('CONTROL_DISPOSITIVOS')) return NextResponse.json({error:'Acceso denegado'},{status:403});
  try {
    const res = await query(
      `SELECT id, tipo_sensor, valor_minimo, valor_maximo, unidad, actualizado_en 
       FROM ConfiguracionUmbral 
       ORDER BY id ASC;`
    );
    return NextResponse.json(res.rows, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: 'Error al consultar umbrales' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: Request) {
    const session = await currentUser();
    if (!session) return NextResponse.json({error:'Sesión requerida'},{status:401});
    if (!session.permisos.includes('CONTROL_DISPOSITIVOS')) return NextResponse.json({error:'Acceso denegado'},{status:403});
  try {
    const { tipo_sensor, valor_minimo, valor_maximo, unidad } = await req.json();

    await query(
      `INSERT INTO ConfiguracionUmbral (tipo_sensor, valor_minimo, valor_maximo, unidad, actualizado_en)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE 
       SET valor_minimo = EXCLUDED.valor_minimo,
           valor_maximo = EXCLUDED.valor_maximo,
           actualizado_en = NOW();`,
      [tipo_sensor, valor_minimo, valor_maximo, unidad]
    );

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: 'Error al guardar umbral' }, { status: 500, headers: corsHeaders });
  }
}