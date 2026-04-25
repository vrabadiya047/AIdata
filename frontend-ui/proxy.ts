import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.SOVEREIGN_JWT_SECRET ?? 'sovereign-test-secret-not-for-production'
);

export async function proxy(req: NextRequest) {
  const token = req.cookies.get('sovereign_session')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });

    // /admin is only accessible to Admin role
    if (req.nextUrl.pathname.startsWith('/admin')) {
      const role = (payload as { role?: string }).role;
      if (role !== 'Admin') {
        return NextResponse.redirect(new URL('/', req.url));
      }
    }

    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete('sovereign_session');
    return res;
  }
}

export const config = {
  matcher: ['/((?!login|api|_next/static|_next/image|favicon\\.ico).*)'],
};
