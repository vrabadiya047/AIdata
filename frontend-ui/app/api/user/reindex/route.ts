import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const BACKEND = 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const cookie = req.cookies.get('sovereign_session')?.value ?? '';
  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/user/reindex`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `sovereign_session=${cookie}` },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
