import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

function sessionCookie(req: NextRequest) {
  return req.cookies.get('sovereign_session')?.value ?? '';
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `sovereign_session=${sessionCookie(req)}`,
    },
    body: JSON.stringify({ name: body.name, username: session.username }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { old_name, new_name } = await req.json();
  const res = await fetch(`${BACKEND}/api/projects/${encodeURIComponent(old_name)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `sovereign_session=${sessionCookie(req)}`,
    },
    body: JSON.stringify({ new_name }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await req.json();
  const res = await fetch(`${BACKEND}/api/projects/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { Cookie: `sovereign_session=${sessionCookie(req)}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
