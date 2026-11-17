import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '../../../../lib/db';
import { digest } from '../../../../lib/auth';
export async function POST() { const token = (await cookies()).get('homeguard_session')?.value; if (token) { await query('UPDATE SesionCamara SET expira_en=NOW() WHERE usuario_id=(SELECT usuario_id FROM Sesion WHERE token_hash=$1)',[digest(token)]); } if (token)
    await query('DELETE FROM Sesion WHERE token_hash=$1', [digest(token)]); const r = NextResponse.json({ success: true }); r.cookies.delete('homeguard_session'); return r; }
