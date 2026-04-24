import { NextRequest, NextResponse } from 'next/server';

const BACKEND = 'http://127.0.0.1:8000';
const cookie = (req: NextRequest) => req.cookies.get('sovereign_session')?.value ?? '';

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get('project') ?? '';
  const res = await fetch(`${BACKEND}/api/jobs?project=${encodeURIComponent(project)}`, {
    headers: { Cookie: `sovereign_session=${cookie(req)}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
