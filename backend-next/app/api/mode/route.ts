import { currentUser } from '../../../lib/auth';
import { NextResponse } from 'next/server';
import { cambiarModoActual } from '../../../lib/mqttWorker';

const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
    const session = await currentUser();
    if (!session) return NextResponse.json({error:'Sesión requerida'},{status:401});
    if (!session.permisos.includes('MODO_ALARMA')) return NextResponse.json({error:'Acceso denegado'},{status:403});
  try {
    const body = await req.json();
    const modo = body.modo;
    const usuario_id = session.id;

    if (!['HOME', 'AWAY', 'DISARMED'].includes(modo)) {
      return NextResponse.json({ error: 'Modo inválido' }, { status: 400, headers: corsHeaders });
    }

    await cambiarModoActual(modo, usuario_id);
    return NextResponse.json({ success: true, modo }, { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error('[API /api/mode] Error:', err);
    return NextResponse.json({ error: 'Error al cambiar modo' }, { status: 500, headers: corsHeaders });
  }
}