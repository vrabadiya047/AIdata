import { NextRequest, NextResponse } from 'next/server';

const BACKEND = 'http://127.0.0.1:8000';
const cookie = (req: NextRequest) => req.cookies.get('sovereign_session')?.value ?? '';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ name: string; target: string }> }) {
  const { name, target } = await params;
  const res = await fetch(`${BACKEND}/api/projects/${encodeURIComponent(name)}/share/${encodeURIComponent(target)}`, {
    method: 'DELETE',
    headers: { Cookie: `sovereign_session=${cookie(req)}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
