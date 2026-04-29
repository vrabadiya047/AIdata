import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const BACKEND = 'http://127.0.0.1:8000';
const cookie  = (req: NextRequest) => req.cookies.get('sovereign_session')?.value ?? '';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'Admin') return NextResponse.json(null, { status: 403 });
  const res = await fetch(`${BACKEND}/api/admin/intelligence`, {
    headers: { Cookie: `sovereign_session=${cookie(req)}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'Admin') return NextResponse.json(null, { status: 403 });
  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/admin/intelligence`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `sovereign_session=${cookie(req)}`,
    },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export const dynamic = 'force-dynamic';
