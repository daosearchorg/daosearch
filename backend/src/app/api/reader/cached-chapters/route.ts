import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { translatedChapters, chapterEntityOccurrences, userBookEntities, userGeneralEntities } from "@/db/schema";
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

  const url = sp.get("url");

  if (url) {
    // Return full translated text for a single chapter + its entity occurrences
    const [chapter] = await db
      .select({
        id: translatedChapters.id,
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
          eq(translatedChapters.sourceUrl, url),
        ),
      )
      .limit(1);

    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    // Fetch entities that appeared in this chapter
    const bookEntities = await db
      .select({
        original: userBookEntities.sourceTerm,
        translated: userBookEntities.translatedTerm,
        gender: userBookEntities.gender,
      })
      .from(chapterEntityOccurrences)
      .innerJoin(userBookEntities, eq(chapterEntityOccurrences.entityId, userBookEntities.id))
      .where(eq(chapterEntityOccurrences.translatedChapterId, chapter.id));

    const generalEntities = await db
      .select({
        original: userGeneralEntities.originalName,
        translated: userGeneralEntities.translatedName,
        gender: userGeneralEntities.gender,
      })
      .from(chapterEntityOccurrences)
      .innerJoin(userGeneralEntities, eq(chapterEntityOccurrences.generalEntityId, userGeneralEntities.id))
      .where(eq(chapterEntityOccurrences.translatedChapterId, chapter.id));

    const entities = [
      ...bookEntities.map((e) => ({ ...e, source: "book" })),
      ...generalEntities.map((e) => ({ ...e, source: "general" })),
    ];

    return NextResponse.json({
      chapterSeq: chapter.chapterSeq,
      translatedTitle: chapter.translatedTitle,
      translatedText: chapter.translatedText,
      sourceDomain: chapter.sourceDomain,
      translatedAt: chapter.translatedAt,
      entities,
    });
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
