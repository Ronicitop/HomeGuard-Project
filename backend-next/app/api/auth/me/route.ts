import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  try {
    // Consulta del usuario ID 1 con sus roles y permisos agregados
    const res = await query(`
      SELECT 
        u.id, 
        u.nombre, 
        u.apellido, 
        u.email, 
        r.nombre AS rol,
        COALESCE(ARRAY_AGG(p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permisos
      FROM Usuario u
      LEFT JOIN RolUsuario ru ON u.id = ru.usuario_id
      LEFT JOIN Rol r ON ru.rol_id = r.id
      LEFT JOIN RolPermiso rp ON r.id = rp.rol_id
      LEFT JOIN Permiso p ON rp.permiso_id = p.id
      WHERE u.id = 1
      GROUP BY u.id, u.nombre, u.apellido, u.email, r.nombre;
    `);

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404, headers: corsHeaders });
    }

    return NextResponse.json(res.rows[0], { headers: corsHeaders });
  } catch (error) {
    console.error('[API /auth/me] Error:', error);
    return NextResponse.json({ error: 'Error consultando usuario y roles' }, { status: 500, headers: corsHeaders });
  }
}