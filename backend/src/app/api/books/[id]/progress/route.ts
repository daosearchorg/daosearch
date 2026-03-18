import { auth } from "@/auth";
import { db } from "@/db";
import { readingProgresses, readingProgressHistories, chapters, bookStats, bookmarks, translatedChapters } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ chapterId: null, sequenceNumber: null, sourceUrl: null });
  }

  const rows = await db
    .select({
      chapterId: readingProgresses.chapterId,
      sequenceNumber: chapters.sequenceNumber,
      chapterSeqOverride: readingProgresses.chapterSeqOverride,
      sourceUrl: readingProgresses.sourceUrl,
      sourceDomain: readingProgresses.sourceDomain,
      lastReadAt: readingProgresses.lastReadAt,
    })
    .from(readingProgresses)
    .leftJoin(chapters, eq(readingProgresses.chapterId, chapters.id))
    .where(and(eq(readingProgresses.userId, session.user.dbId), eq(readingProgresses.bookId, bookId)))
    .orderBy(desc(readingProgresses.lastReadAt));

  // Return primary (most recent) + all sources
  const primary = rows[0] ?? null;
  return NextResponse.json({
    chapterId: primary?.chapterId ?? null,
    sequenceNumber: primary?.chapterSeqOverride ?? primary?.sequenceNumber ?? null,
    sourceUrl: primary?.sourceUrl ?? null,
    sourceDomain: primary?.sourceDomain ?? null,
    allSources: rows.map((r) => ({
      sourceDomain: r.sourceDomain,
      sourceUrl: r.sourceUrl,
      sequenceNumber: r.chapterSeqOverride ?? r.sequenceNumber ?? null,
    })),
  });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const chapterId = body.chapterId ? Number(body.chapterId) : null;
  const chapterSeq = body.chapterSeq ? Number(body.chapterSeq) : null;
  const sourceUrl = body.sourceUrl ? String(body.sourceUrl) : null;
  const sourceDomain = sourceUrl ? new URL(sourceUrl).hostname : null;

  // Need at least chapterId, chapterSeq, or sourceUrl
  if (!chapterId && !chapterSeq && !sourceUrl) {
    return NextResponse.json({ error: "chapterId, chapterSeq, or sourceUrl required" }, { status: 400 });
  }

  // Upsert reading progress
  const values: Record<string, unknown> = {
    userId: session.user.dbId,
    bookId,
    lastReadAt: new Date(),
  };
  const updateSet: Record<string, unknown> = {
    lastReadAt: new Date(),
    updatedAt: new Date(),
  };

  if (chapterId) {
    values.chapterId = chapterId;
    updateSet.chapterId = chapterId;
  }
  if (chapterSeq != null) {
    values.chapterSeqOverride = chapterSeq;
    updateSet.chapterSeqOverride = chapterSeq;
  }
  if (sourceUrl) {
    values.sourceUrl = sourceUrl;
    values.sourceDomain = sourceDomain;
    updateSet.sourceUrl = sourceUrl;
    updateSet.sourceDomain = sourceDomain;
  }

  await db
    .insert(readingProgresses)
    .values(values as typeof readingProgresses.$inferInsert)
    .onConflictDoUpdate({
      target: [readingProgresses.userId, readingProgresses.bookId, readingProgresses.sourceDomain],
      set: updateSet,
    });

  // Record history
  await db
    .insert(readingProgressHistories)
    .values({
      userId: session.user.dbId,
      bookId,
      ...(chapterId ? { chapterId } : {}),
    });

  // Refresh reader count
  await db
    .update(bookStats)
    .set({
      readerCount: sql`(SELECT count(*) FROM reading_progresses WHERE book_id = ${bookId})`,
      updatedAt: new Date(),
    })
    .where(eq(bookStats.bookId, bookId));

  // Auto-bookmark with "reading" status
  await db
    .insert(bookmarks)
    .values({ userId: session.user.dbId, bookId, status: "reading" })
    .onConflictDoUpdate({
      target: [bookmarks.userId, bookmarks.bookId],
      set: {
        status: sql`CASE WHEN ${bookmarks.status} IS NULL OR ${bookmarks.status} = 'plan_to_read' THEN 'reading' ELSE ${bookmarks.status} END`,
      },
    });

  // Refresh bookmark count
  await db
    .update(bookStats)
    .set({
      bookmarkCount: sql`(SELECT count(*) FROM bookmarks WHERE book_id = ${bookId})`,
      updatedAt: new Date(),
    })
    .where(eq(bookStats.bookId, bookId));

  // Get the sequence number to return
  let sequenceNumber = chapterSeq;
  if (!sequenceNumber && chapterId) {
    const [ch] = await db
      .select({ sequenceNumber: chapters.sequenceNumber })
      .from(chapters)
      .where(eq(chapters.id, chapterId))
      .limit(1);
    sequenceNumber = ch?.sequenceNumber ?? null;
  }

  return NextResponse.json({
    chapterId,
    sequenceNumber,
    sourceUrl,
  });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sourceDomain = searchParams.get("domain");
  if (!sourceDomain) {
    return NextResponse.json({ error: "domain query param required" }, { status: 400 });
  }

  // Delete translated chapters for this domain (cascade deletes chapter_entity_occurrences)
  await db
    .delete(translatedChapters)
    .where(
      and(
        eq(translatedChapters.userId, session.user.dbId),
        eq(translatedChapters.bookId, bookId),
        eq(translatedChapters.sourceDomain, sourceDomain),
      ),
    );

  // Delete the reading progress for this domain
  await db
    .delete(readingProgresses)
    .where(
      and(
        eq(readingProgresses.userId, session.user.dbId),
        eq(readingProgresses.bookId, bookId),
        eq(readingProgresses.sourceDomain, sourceDomain),
      ),
    );

  // Refresh reader count
  await db
    .update(bookStats)
    .set({
      readerCount: sql`(SELECT count(distinct user_id) FROM reading_progresses WHERE book_id = ${bookId})`,
      updatedAt: new Date(),
    })
    .where(eq(bookStats.bookId, bookId));

  return NextResponse.json({ ok: true });
}
