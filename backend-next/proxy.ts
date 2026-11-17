import {NextRequest,NextResponse} from 'next/server';
// Mutating API handlers perform session, CSRF and household checks themselves.
// This guard uses the same explicit origin list rather than the camera branch's second policy.
export function proxy(request:NextRequest){if(!['GET','HEAD','OPTIONS'].includes(request.method)){const origin=request.headers.get('origin');const allowed=(process.env.HG_WEB_ORIGIN||process.env.PUBLIC_ORIGIN||'http://localhost:5173,http://127.0.0.1:5173').split(',').map(x=>x.trim());if(origin&&!allowed.includes(origin))return NextResponse.json({error:{code:'INVALID_ORIGIN',message:'Origen no permitido.'}},{status:403});}return NextResponse.next();}
export const config={matcher:'/api/:path*'};
