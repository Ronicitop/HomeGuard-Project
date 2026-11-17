import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { query } from '../../../../lib/db';
import { verifyPassword, digest } from '../../../../lib/auth';
export async function POST(req: Request) {
    const { email, password } = await req.json().catch(() => ({}));
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 256)
        return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 400 });
    const r = await query('SELECT * FROM Usuario WHERE lower(email)=lower($1) AND activo=TRUE', [email]);
    if (!r.rows[0] || !verifyPassword(password, r.rows[0].password_hash))
        return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    const token = randomBytes(32).toString('hex');
    await query("INSERT INTO Sesion(token_hash,usuario_id,expira_en) VALUES($1,$2,NOW()+interval '8 hours')", [digest(token), r.rows[0].id]);
    const res = NextResponse.json({ success: true });
    res.cookies.set('homeguard_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 28800 });
    return res;
}
