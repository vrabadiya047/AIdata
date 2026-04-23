import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const cookie = req.cookies.get("sovereign_session")?.value ?? "";

  const response = await fetch("http://127.0.0.1:8000/api/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `sovereign_session=${cookie}`,
    },
    body: JSON.stringify(body),
  });

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
