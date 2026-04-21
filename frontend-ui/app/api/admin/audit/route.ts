import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const res = await fetch(`${BACKEND}/api/admin/audit`, {
    headers: { Cookie: `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
