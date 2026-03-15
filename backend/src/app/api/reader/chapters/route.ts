import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { chapters, books } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

const READER_URL = process.env.READER_SERVICE_URL || "http://localhost:8000";

/**
 * If source is book.qq.com, serve chapters from DB directly (no scraping needed).
 * Returns the chapter list in the same ChapterEntry format the reader service uses.
 */
async function getDbChapters(sourceUrl: string) {
  // Extract book ID from source URL pattern: book.qq.com/book-detail/{id} or similar
  // The book's `url` column stores the book.qq.com URL
  const book = await db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.url, sourceUrl))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!book) return null;

  const rows = await db
    .select({
      title: chapters.title,
      titleTranslated: chapters.titleTranslated,
      url: chapters.url,
      sequenceNumber: chapters.sequenceNumber,
    })
    .from(chapters)
    .where(eq(chapters.bookId, book.id))
    .orderBy(asc(chapters.sequenceNumber));

  if (!rows.length) return null;

  return rows.map((ch) => ({
    title: ch.title || `Chapter ${ch.sequenceNumber}`,
    title_en: ch.titleTranslated || "",
    url: ch.url || "",
    sequence: ch.sequenceNumber,
  }));
}

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

  // If source is book.qq.com, serve from DB directly
  if (!refresh && sourceUrl.includes("book.qq.com")) {
    const dbChapters = await getDbChapters(sourceUrl);
    if (dbChapters) {
      if (stream) {
        const json = JSON.stringify(dbChapters);
        const body = `event: status\ndata: Loaded from database\n\nevent: chapters\ndata: ${json}\n\n`;
        return new Response(body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      return NextResponse.json(dbChapters);
    }
  }

  // Otherwise proxy to reader service
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
