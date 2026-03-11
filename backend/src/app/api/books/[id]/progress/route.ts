import { auth } from "@/auth";
import { db } from "@/db";
import { readingProgresses, readingProgressHistories, chapters, bookStats, bookmarks } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
    return NextResponse.json({ chapterId: null, sequenceNumber: null });
  }

  const [row] = await db
    .select({
      chapterId: readingProgresses.chapterId,
      sequenceNumber: chapters.sequenceNumber,
    })
    .from(readingProgresses)
    .leftJoin(chapters, eq(readingProgresses.chapterId, chapters.id))
    .where(and(eq(readingProgresses.userId, session.user.dbId), eq(readingProgresses.bookId, bookId)))
    .limit(1);

  return NextResponse.json({
    chapterId: row?.chapterId ?? null,
    sequenceNumber: row?.sequenceNumber ?? null,
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
  const chapterId = Number(body.chapterId);
  if (isNaN(chapterId)) {
    return NextResponse.json({ error: "Invalid chapter ID" }, { status: 400 });
  }

  // Upsert reading progress
  await db
    .insert(readingProgresses)
    .values({
      userId: session.user.dbId,
      bookId,
      chapterId,
      lastReadAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [readingProgresses.userId, readingProgresses.bookId],
      set: { chapterId, lastReadAt: new Date(), updatedAt: new Date() },
    });

  // Record history
  await db
    .insert(readingProgressHistories)
    .values({
      userId: session.user.dbId,
      bookId,
      chapterId,
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
  const [ch] = await db
    .select({ sequenceNumber: chapters.sequenceNumber })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  return NextResponse.json({
    chapterId,
    sequenceNumber: ch?.sequenceNumber ?? null,
  });
}
