import { NextRequest, NextResponse } from 'next/server';

const BACKEND = 'http://127.0.0.1:8000';
const cookie = (req: NextRequest) => req.cookies.get('sovereign_session')?.value ?? '';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const res = await fetch(`${BACKEND}/api/admin/users/${encodeURIComponent(username)}/mfa`, {
    method: 'DELETE',
    headers: { Cookie: `sovereign_session=${cookie(req)}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
