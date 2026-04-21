import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const res = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const data = await res.json();
  await createSession({ username: data.username, role: data.role });

  return NextResponse.json({
    username: data.username,
    role: data.role,
    requires_change: data.requires_change,
  });
}
