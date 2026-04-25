import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Invalid code' }));
    return NextResponse.json({ error: err.detail ?? 'Invalid code' }, { status: res.status });
  }

  const data = await res.json();
  await createSession({ username: data.username, role: data.role });
  return NextResponse.json({
    username: data.username,
    role: data.role,
    requires_change: data.requires_change,
  });
}
