import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  try {
    const resUsers = await query(`
      SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.activo, u.creado_en, r.nombre AS rol
      FROM Usuario u
      LEFT JOIN RolUsuario ru ON u.id = ru.usuario_id
      LEFT JOIN Rol r ON ru.rol_id = r.id
      ORDER BY u.id ASC;
    `);

    const resRoles = await query(`SELECT id, nombre, descripcion FROM Rol ORDER BY id ASC;`);

    return NextResponse.json({ usuarios: resUsers.rows, roles: resRoles.rows }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Error al consultar usuarios' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: Request) {
  try {
    const { nombre, apellido, email, password, telefono, rol_id } = await req.json();

    if (!nombre || !apellido || !email || !password || !rol_id) {
      return NextResponse.json({ error: 'Todos los campos obligatorios deben completarse' }, { status: 400, headers: corsHeaders });
    }

    const resUser = await query(
      `INSERT INTO Usuario (nombre, apellido, email, password_hash, telefono, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, nombre, apellido, email`,
      [nombre, apellido, email, password, telefono ? parseInt(telefono, 10) : null]
    );

    const nuevoId = resUser.rows[0].id;

    // Asignar rol al usuario
    await query(`INSERT INTO RolUsuario (usuario_id, rol_id) VALUES ($1, $2)`, [nuevoId, rol_id]);

    return NextResponse.json({ success: true, usuario: resUser.rows[0] }, { status: 201, headers: corsHeaders });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'El correo electrónico ya está registrado' }, { status: 409, headers: corsHeaders });
    }
    console.error('[API /admin/users] Error:', err);
    return NextResponse.json({ error: 'Error al registrar usuario' }, { status: 500, headers: corsHeaders });
  }
}