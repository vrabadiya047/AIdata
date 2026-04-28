import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const BACKEND = 'http://127.0.0.1:8000';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const cookie = req.cookies.get('sovereign_session')?.value ?? '';
  const res = await fetch(`${BACKEND}/api/admin/workspaces`, {
    headers: { Cookie: `sovereign_session=${cookie}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
