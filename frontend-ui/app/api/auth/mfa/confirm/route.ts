import { NextRequest, NextResponse } from 'next/server';

const BACKEND = 'http://127.0.0.1:8000';
const cookie = (req: NextRequest) => req.cookies.get('sovereign_session')?.value ?? '';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/auth/mfa/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `sovereign_session=${cookie(req)}` },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
