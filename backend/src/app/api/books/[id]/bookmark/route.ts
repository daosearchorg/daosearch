import { auth } from "@/auth";
import { db } from "@/db";
import { bookmarks, bookStats } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isValidReadingStatus } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function refreshBookmarkCount(bookId: number) {
  await db
    .update(bookStats)
    .set({
      bookmarkCount: sql`(SELECT count(*) FROM bookmarks WHERE book_id = ${bookId})`,
      updatedAt: new Date(),
    })
    .where(eq(bookStats.bookId, bookId));
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ bookmarked: false, status: null });
  }

  const [row] = await db
    .select({ id: bookmarks.id, status: bookmarks.status })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, session.user.dbId), eq(bookmarks.bookId, bookId)))
    .limit(1);

  return NextResponse.json({ bookmarked: !!row, status: row?.status ?? null });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let statusValue: string | null = null;
  try {
    const body = await request.json();
    if (body.status && isValidReadingStatus(body.status)) {
      statusValue = body.status;
    }
  } catch {
    // No body or invalid JSON — that's fine, status stays null
  }

  if (statusValue) {
    await db
      .insert(bookmarks)
      .values({ userId: session.user.dbId, bookId, status: statusValue })
      .onConflictDoUpdate({
        target: [bookmarks.userId, bookmarks.bookId],
        set: { status: statusValue },
      });
  } else {
    await db
      .insert(bookmarks)
      .values({ userId: session.user.dbId, bookId })
      .onConflictDoNothing();
  }

  await refreshBookmarkCount(bookId);

  return NextResponse.json({ bookmarked: true, status: statusValue });
}

export async function PATCH(request: Request, { params }: RouteParams) {
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
  const newStatus = body.status;

  if (newStatus !== null && !isValidReadingStatus(newStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const [row] = await db
    .update(bookmarks)
    .set({ status: newStatus })
    .where(and(eq(bookmarks.userId, session.user.dbId), eq(bookmarks.bookId, bookId)))
    .returning({ id: bookmarks.id, status: bookmarks.status });

  if (!row) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  return NextResponse.json({ bookmarked: true, status: row.status });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, session.user.dbId), eq(bookmarks.bookId, bookId)));

  await refreshBookmarkCount(bookId);

  return NextResponse.json({ bookmarked: false, status: null });
}
