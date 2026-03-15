import { getChapterContent } from "@/lib/reader";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chapterUrl = url.searchParams.get("url");
  if (!chapterUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const content = await getChapterContent(chapterUrl);
    return NextResponse.json(content);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch chapter" },
      { status: 502 },
    );
  }
}
