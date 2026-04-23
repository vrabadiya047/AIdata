import { NextRequest, NextResponse } from 'next/server';

const BACKEND = 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get('sovereign_session')?.value ?? '';
  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `sovereign_session=${cookie}` },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
