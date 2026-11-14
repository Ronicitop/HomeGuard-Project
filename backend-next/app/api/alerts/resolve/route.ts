import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { id_alerta } = body;

    if (id_alerta) {
      await query(`UPDATE AlertaCorrelacionada SET resuelta = TRUE WHERE id = $1`, [id_alerta]);
    } else {
      // Si no se envía ID, resuelve todas las alertas activas
      await query(`UPDATE AlertaCorrelacionada SET resuelta = TRUE WHERE resuelta = FALSE`);
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('[API /alerts/resolve] Error:', error);
    return NextResponse.json({ error: 'Error resolviendo alertas' }, { status: 500, headers: corsHeaders });
  }
}