import { NextResponse } from 'next/server';
import { ejecutarComandoActuador } from '../../../../lib/mqttWorker';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { codigo, estado, usuario_id } = await req.json();
    if (!codigo || !['ON', 'OFF'].includes(estado)) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400, headers: corsHeaders });
    }

    const actuador = await ejecutarComandoActuador(codigo, estado, usuario_id || 1, 'MANUAL_WEB');
    return NextResponse.json({ success: true, actuador }, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}