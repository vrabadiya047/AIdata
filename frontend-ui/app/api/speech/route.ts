import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const BACKEND = 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cookie = req.cookies.get('sovereign_session')?.value ?? '';
  const body = await req.arrayBuffer();
  const contentType = req.headers.get('content-type') ?? 'multipart/form-data';

  const res = await fetch(`${BACKEND}/api/speech`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      Cookie: `sovereign_session=${cookie}`,
    },
    body,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
