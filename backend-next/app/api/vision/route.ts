

import { NextResponse } from 'next/server';

import { currentUser } from '../../../lib/auth';

import { query } from '../../../lib/db';
import {expireStreams} from '../../../lib/streams';

export const dynamic = 'force-dynamic';

async function access() { const u = await currentUser(); return u && ['ADMIN', 'RESIDENTE'].includes(u.rol) ? u : null; }

export async function GET(req: Request) { if (!await access())

    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }); const url = new URL(req.url); const page = Math.max(1, Math.min(10000, Math.floor(Number(url.searchParams.get('page'))) || 1)); const [c, p, e] = await Promise.all([query('SELECT * FROM Camara ORDER BY id'), query('SELECT id,nombre,modelo FROM PerfilFacial ORDER BY id'), query("SELECT e.*,p.nombre FROM EventoCamara e LEFT JOIN PerfilFacial p ON p.id=e.perfil_id WHERE e.fecha>NOW()-interval '30 days' ORDER BY e.fecha DESC LIMIT 25 OFFSET $1", [(page - 1) * 25])]); return NextResponse.json({ cameras: c.rows, profiles: p.rows, events: e.rows, page }); }

export async function POST(req: Request) {

    const u = await access();

    if (!u)

        return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });

    if (Number(req.headers.get('content-length')) > 262144)

        return NextResponse.json({ error: 'Datos demasiado grandes' }, { status: 413 });

    const raw = await req.text();

    const b = raw.length <= 262144 ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;

    if (!b)

        return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

    if (b.action === 'camera' && typeof b.name === 'string' && b.name.trim().length > 0 && b.name.length <= 100) {

        const r = await query('INSERT INTO Camara(nombre) VALUES($1) RETURNING *', [b.name.trim()]);

        return NextResponse.json(r.rows[0]);

    }

    // Descriptors and events are produced exclusively by the inference service.
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });

}

export async function DELETE(req: Request) { const u = await access(); if (u?.rol !== 'ADMIN')

    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }); const b = await req.json().catch(()=>null); if (!b || !Number.isInteger(b.id))

    return NextResponse.json({ error: 'ID inválido' }, { status: 400 }); if (b.type === 'camera') { await query('UPDATE SesionCamara SET expira_en=NOW() WHERE camara_id=$1',[b.id]); await expireStreams(); if((await query('SELECT 1 FROM SesionCamara WHERE camara_id=$1',[b.id])).rowCount) return NextResponse.json({error:'No se pudo desconectar la cámara. Inténtalo nuevamente.'},{status:503}); await query('DELETE FROM Camara WHERE id=$1', [b.id]); }

    else await query('DELETE FROM PerfilFacial WHERE id=$1', [b.id]); return NextResponse.json({ ok: true }); }
