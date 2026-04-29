import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401 });
  const { id } = await params;
  const cookie = `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}`;
  const res = await fetch(`${BACKEND}/api/auth/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export const dynamic = 'force-dynamic';
