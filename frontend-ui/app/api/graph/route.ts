import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project") ?? "";
  const cookie  = req.cookies.get("sovereign_session")?.value ?? "";

  try {
    const r = await fetch(
      `http://127.0.0.1:8000/api/graph?project=${encodeURIComponent(project)}`,
      { headers: { Cookie: `sovereign_session=${cookie}` } }
    );
    const data = await r.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ enabled: false, nodes: [], edges: [], error: "Backend unreachable" });
  }
}
