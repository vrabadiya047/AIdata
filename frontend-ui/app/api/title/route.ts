import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const cookie = req.cookies.get("sovereign_session")?.value ?? "";

  const res = await fetch("http://127.0.0.1:8000/api/title", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `sovereign_session=${cookie}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
