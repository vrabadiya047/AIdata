import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { new_password } = await req.json();

  const res = await fetch(`${BACKEND}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}`,
    },
    body: JSON.stringify({ new_password }),
  });

  if (!res.ok) return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  return NextResponse.json({ status: 'updated' });
}
