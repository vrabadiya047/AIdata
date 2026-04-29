import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

function backendCookie(req: NextRequest) {
  return { Cookie: `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}` };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401 });
  const res = await fetch(`${BACKEND}/api/auth/profile`, { headers: backendCookie(req) });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401 });
  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/auth/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...backendCookie(req) },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export const dynamic = 'force-dynamic';
