import { currentUser } from '../../../../lib/auth';
import { NextResponse } from 'next/server';
import { ejecutarComandoActuador } from '../../../../lib/mqttWorker';

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
    if (!session.permisos.includes('CONTROL_DISPOSITIVOS')) return NextResponse.json({error:'Acceso denegado'},{status:403});
  try {
    const { codigo, estado, usuario_id } = await req.json();
    if (!codigo || !['ON', 'OFF'].includes(estado)) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400, headers: corsHeaders });
    }

    const actuador = await ejecutarComandoActuador(codigo, estado, session.id, 'MANUAL_WEB');
    return NextResponse.json({ success: true, actuador }, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}