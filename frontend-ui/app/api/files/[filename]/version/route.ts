import { NextRequest, NextResponse } from "next/server";

const BACKEND = "http://127.0.0.1:8000";

export async function PUT(req: NextRequest, { params }: { params: { filename: string } }) {
  const cookie = req.cookies.get("sovereign_session")?.value ?? "";
  const body = await req.json();

  const res = await fetch(
    `${BACKEND}/api/files/${encodeURIComponent(params.filename)}/version`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sovereign_session=${cookie}`,
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
