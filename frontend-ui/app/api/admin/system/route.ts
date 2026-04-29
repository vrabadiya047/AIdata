import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'Admin') return NextResponse.json(null, { status: 403 });
  const res = await fetch(`${BACKEND}/api/admin/system`, {
    headers: { Cookie: `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export const dynamic = 'force-dynamic';
