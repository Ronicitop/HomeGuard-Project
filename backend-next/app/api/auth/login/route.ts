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

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Credenciales incompletas' }, { status: 400, headers: corsHeaders });
    }

    // Consulta de usuario con su rol y matriz de permisos
    const res = await query(
      `SELECT 
        u.id, 
        u.nombre, 
        u.apellido, 
        u.email, 
        u.password_hash, 
        u.activo,
        r.nombre AS rol,
        COALESCE(ARRAY_AGG(p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permisos
      FROM Usuario u
      LEFT JOIN RolUsuario ru ON u.id = ru.usuario_id
      LEFT JOIN Rol r ON ru.rol_id = r.id
      LEFT JOIN RolPermiso rp ON r.id = rp.rol_id
      LEFT JOIN Permiso p ON rp.permiso_id = p.id
      WHERE LOWER(u.email) = LOWER($1)
      GROUP BY u.id, u.nombre, u.apellido, u.email, u.password_hash, u.activo, r.nombre`,
      [email]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404, headers: corsHeaders });
    }

    const usuario = res.rows[0];

    if (!usuario.activo) {
      return NextResponse.json({ error: 'La cuenta se encuentra inactiva' }, { status: 403, headers: corsHeaders });
    }

    // Validación de contraseña (en producción usar bcrypt)
    if (usuario.password_hash !== password) {
      return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401, headers: corsHeaders });
    }

    // Actualizar última conexión en base de datos
    await query(`UPDATE Usuario SET ultima_conexion = NOW() WHERE id = $1`, [usuario.id]);

    const { password_hash, ...datosSesion } = usuario;
    return NextResponse.json({ success: true, usuario: datosSesion }, { headers: corsHeaders });
  } catch (error) {
    console.error('[API /auth/login] Error:', error);
    return NextResponse.json({ error: 'Error interno en autenticación' }, { status: 500, headers: corsHeaders });
  }
}