import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = req.nextUrl.searchParams.get('project') ?? '';
  const res = await fetch(`${BACKEND}/api/threads?project=${encodeURIComponent(project)}`, {
    headers: { Cookie: `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
