import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

function sessionCookie(req: NextRequest) {
  return req.cookies.get('sovereign_session')?.value ?? '';
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = req.nextUrl.searchParams.get('project') ?? '';
  const res = await fetch(`${BACKEND}/api/threads?project=${encodeURIComponent(project)}`, {
    headers: { Cookie: `sovereign_session=${sessionCookie(req)}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/threads`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `sovereign_session=${sessionCookie(req)}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project, thread_id } = await req.json();
  const params = new URLSearchParams({ project, thread_id });
  const res = await fetch(`${BACKEND}/api/threads?${params}`, {
    method: 'DELETE',
    headers: { Cookie: `sovereign_session=${sessionCookie(req)}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
