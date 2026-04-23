import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

function backendCookie(req: NextRequest) {
  return { Cookie: `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}` };
}

async function assertAdmin(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'Admin') return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!await assertAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const res = await fetch(`${BACKEND}/api/admin/users`, { headers: backendCookie(req) });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  if (!await assertAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...backendCookie(req) },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(req: NextRequest) {
  if (!await assertAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { username } = await req.json();
  const res = await fetch(`${BACKEND}/api/admin/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: backendCookie(req),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
