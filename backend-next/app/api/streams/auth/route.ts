import {NextResponse} from 'next/server';
import {query} from '../../../../lib/db';
import {digest} from '../../../../lib/password';
export async function POST(req:Request){
 const b=await req.json().catch(()=>({}));
 const token=b.token||b.password;
 if(typeof b.id!=='string'||!b.id||typeof token!=='string'||!['publish','read'].includes(b.action))return new NextResponse(null,{status:403});
 const type=b.action==='publish'?'publish':b.protocol==='rtsp'?'process':'view';
 if((type==='process'&&b.protocol!=='rtsp')||(type!=='process'&&b.protocol!=='webrtc'))return new NextResponse(null,{status:403});
 const r=await query("UPDATE SesionCamara s SET media_id=$4 FROM Usuario u WHERE s.usuario_id=u.id AND u.activo=TRUE AND s.token_hash=$1 AND s.ruta=$2 AND s.tipo=$3 AND s.expira_en>NOW() AND (s.media_id IS NULL OR s.media_id=$4) RETURNING s.id",[digest(token),b.path,type,b.id]);
 return new NextResponse(null,{status:r.rowCount?204:403});
}
