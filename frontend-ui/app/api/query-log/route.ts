import { NextRequest, NextResponse } from 'next/server';

const BACKEND = 'http://127.0.0.1:8000';

export async function GET(req: NextRequest) {
  const res = await fetch(`${BACKEND}/api/query-log`, {
    headers: { Cookie: `sovereign_session=${req.cookies.get('sovereign_session')?.value ?? ''}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
