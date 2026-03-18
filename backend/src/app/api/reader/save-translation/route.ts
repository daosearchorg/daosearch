import { auth } from "@/auth";
import { db } from "@/db";
import { translatedChapters, chapterEntityOccurrences, userBookEntities, userGeneralEntities } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bookId, chapterSeq, sourceUrl, translatedTitle, translatedText, sourceDomain } = body;

  if (!bookId || !sourceUrl) {
    return NextResponse.json(
      { error: "bookId and sourceUrl are required" },
      { status: 400 },
    );
  }

  await db
    .insert(translatedChapters)
    .values({
      userId: session.user.dbId,
      bookId: Number(bookId),
      chapterSeq: chapterSeq != null ? Number(chapterSeq) : null,
      sourceUrl: String(sourceUrl),
      translatedTitle: translatedTitle || null,
      translatedText: translatedText || "",
      sourceDomain: sourceDomain || null,
      translatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        translatedChapters.userId,
        translatedChapters.bookId,
        translatedChapters.sourceUrl,
      ],
      set: {
        chapterSeq: chapterSeq != null ? Number(chapterSeq) : null,
        translatedTitle: translatedTitle || null,
        translatedText: translatedText || "",
        sourceDomain: sourceDomain || null,
        translatedAt: new Date(),
      },
    });

  // Save entity occurrences for this chapter
  if (Array.isArray(body.entities) && body.entities.length > 0) {
    const [chapter] = await db
      .select({ id: translatedChapters.id })
      .from(translatedChapters)
      .where(
        and(
          eq(translatedChapters.userId, session.user.dbId),
          eq(translatedChapters.bookId, Number(bookId)),
          eq(translatedChapters.sourceUrl, String(sourceUrl)),
        ),
      )
      .limit(1);

    if (chapter) {
      const sourceTerms = body.entities
        .map((e: { original: string }) => e.original)
        .filter(Boolean);

      if (sourceTerms.length > 0) {
        // Look up book-scoped entities
        const bookEntityRows = await db
          .select({ id: userBookEntities.id })
          .from(userBookEntities)
          .where(
            and(
              eq(userBookEntities.userId, session.user.dbId),
              eq(userBookEntities.bookId, Number(bookId)),
              inArray(userBookEntities.sourceTerm, sourceTerms),
            ),
          );

        // Look up general entities
        const generalEntityRows = await db
          .select({ id: userGeneralEntities.id })
          .from(userGeneralEntities)
          .where(
            and(
              eq(userGeneralEntities.userId, session.user.dbId),
              inArray(userGeneralEntities.originalName, sourceTerms),
            ),
          );

        // Delete old occurrences, insert new
        await db
          .delete(chapterEntityOccurrences)
          .where(eq(chapterEntityOccurrences.translatedChapterId, chapter.id));

        const values: { translatedChapterId: number; entityId?: number; generalEntityId?: number }[] = [];
        for (const e of bookEntityRows) {
          values.push({ translatedChapterId: chapter.id, entityId: e.id });
        }
        for (const e of generalEntityRows) {
          values.push({ translatedChapterId: chapter.id, generalEntityId: e.id });
        }

        if (values.length > 0) {
          await db
            .insert(chapterEntityOccurrences)
            .values(values)
            .onConflictDoNothing();
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
