import { auth } from "@/auth";
import { NextResponse } from "next/server";

const READER_URL = process.env.READER_SERVICE_URL || "http://localhost:8000";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("url");
  if (!sourceUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const refresh = url.searchParams.get("refresh") === "1";
  const stream = url.searchParams.get("stream") === "1";

  const readerUrl = new URL("/chapters", READER_URL);
  readerUrl.searchParams.set("url", sourceUrl);
  if (refresh) readerUrl.searchParams.set("refresh", "true");
  if (stream) readerUrl.searchParams.set("stream", "true");

  try {
    const res = await fetch(readerUrl.toString(), {
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: text || "Failed to fetch chapters" }, { status: 502 });
    }

    // If streaming, pass through the SSE stream
    if (stream && res.body) {
      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch chapters" },
      { status: 502 },
    );
  }
}
