import { NextRequest, NextResponse } from 'next/server';
export function proxy(req: NextRequest) { if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const expected = process.env.PUBLIC_ORIGIN || (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : req.nextUrl.origin);
    if (origin && origin !== expected && !(process.env.NODE_ENV === 'development' && origin === 'http://localhost:5173'))
        return NextResponse.json({ error: 'Origen inválido' }, { status: 403 });
} return NextResponse.next(); }
export const config = { matcher: '/api/:path*' };
