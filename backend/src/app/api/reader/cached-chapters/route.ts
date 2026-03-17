import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { translatedChapters } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const bookId = Number(sp.get("bookId"));
  if (!bookId || isNaN(bookId)) {
    return NextResponse.json({ error: "bookId required" }, { status: 400 });
  }

  const seq = sp.get("seq") ? Number(sp.get("seq")) : null;

  if (seq != null) {
    // Return full translated text for a single chapter
    const [chapter] = await db
      .select({
        chapterSeq: translatedChapters.chapterSeq,
        translatedTitle: translatedChapters.translatedTitle,
        translatedText: translatedChapters.translatedText,
        sourceDomain: translatedChapters.sourceDomain,
        translatedAt: translatedChapters.translatedAt,
      })
      .from(translatedChapters)
      .where(
        and(
          eq(translatedChapters.userId, session.user.dbId),
          eq(translatedChapters.bookId, bookId),
          eq(translatedChapters.chapterSeq, seq),
        ),
      )
      .limit(1);

    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
    return NextResponse.json(chapter);
  }

  // Return list of cached chapter metadata
  const chapters = await db
    .select({
      chapterSeq: translatedChapters.chapterSeq,
      translatedTitle: translatedChapters.translatedTitle,
      sourceDomain: translatedChapters.sourceDomain,
      translatedAt: translatedChapters.translatedAt,
    })
    .from(translatedChapters)
    .where(
      and(
        eq(translatedChapters.userId, session.user.dbId),
        eq(translatedChapters.bookId, bookId),
      ),
    )
    .orderBy(asc(translatedChapters.chapterSeq));

  return NextResponse.json(chapters);
}
