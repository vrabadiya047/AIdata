import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const userAgent = req.headers.get('user-agent') ?? '';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? '127.0.0.1';

  const res = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, user_agent: userAgent, ip_address: ip }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const data = await res.json();

  // MFA required — return pending token to client without creating a session yet.
  if (data.mfa_required) {
    return NextResponse.json({ mfa_required: true, mfa_token: data.mfa_token });
  }

  await createSession({ username: data.username, role: data.role, session_id: data.session_id });
  return NextResponse.json({
    username: data.username,
    role: data.role,
    requires_change: data.requires_change,
    mfa_required: false,
  });
}

export const dynamic = 'force-dynamic';
