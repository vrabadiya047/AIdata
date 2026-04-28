import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q') ?? '';
  const cookie = req.cookies.get('sovereign_session')?.value ?? '';

  const res = await fetch(
    `${BACKEND}/api/users/search?q=${encodeURIComponent(q)}`,
    { headers: { Cookie: `sovereign_session=${cookie}` } },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
