import { cookies } from 'next/headers';
import { query } from './db';
import { digest } from './password';
export { hashPassword, verifyPassword, digest } from './password';
export async function currentUser() { const token = (await cookies()).get('homeguard_session')?.value; if (!token)
    return null; const r = await query(`SELECT u.id,u.nombre,u.apellido,u.email,r.nombre AS rol, COALESCE(array_agg(DISTINCT p.codigo) FILTER (WHERE p.codigo IS NOT NULL),'{}') AS permisos FROM Sesion s JOIN Usuario u ON u.id=s.usuario_id LEFT JOIN RolUsuario ru ON ru.usuario_id=u.id LEFT JOIN Rol r ON r.id=ru.rol_id LEFT JOIN RolPermiso rp ON rp.rol_id=r.id LEFT JOIN Permiso p ON p.id=rp.permiso_id WHERE s.token_hash=$1 AND s.expira_en>NOW() AND u.activo=TRUE GROUP BY u.id,r.nombre`, [digest(token)]); return r.rows[0] || null; }
