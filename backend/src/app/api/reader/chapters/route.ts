import { getSourceChapters } from "@/lib/reader";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("url");
  if (!sourceUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const chapters = await getSourceChapters(sourceUrl);
    return NextResponse.json(chapters);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch chapters" },
      { status: 502 },
    );
  }
}
