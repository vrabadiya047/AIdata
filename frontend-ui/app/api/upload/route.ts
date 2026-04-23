import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  formData.set('project', formData.get('project') as string);

  const res = await fetch(`${BACKEND}/api/upload`, {
    method: 'POST',
    headers: { Cookie: `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}` },
    body: formData,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
