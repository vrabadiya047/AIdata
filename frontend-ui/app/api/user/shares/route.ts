import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401 });
  const cookie = `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}`;
  const res = await fetch(`${BACKEND}/api/user/shares`, { headers: { Cookie: cookie } });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401 });
  const { project, shared_with } = await req.json();
  const cookie = `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}`;
  const res = await fetch(
    `${BACKEND}/api/projects/${encodeURIComponent(project)}/share/${encodeURIComponent(shared_with)}`,
    { method: 'DELETE', headers: { Cookie: cookie } }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}

export const dynamic = 'force-dynamic';
