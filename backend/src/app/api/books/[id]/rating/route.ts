import { auth } from "@/auth";
import { db } from "@/db";
import { bookRatings, bookStats } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function refreshRatingStats(bookId: number) {
  await db
    .update(bookStats)
    .set({
      ratingCount: sql`(SELECT count(*) FROM book_ratings WHERE book_id = ${bookId})`,
      ratingPositive: sql`(SELECT count(*) FROM book_ratings WHERE book_id = ${bookId} AND rating = 1)`,
      ratingNeutral: sql`(SELECT count(*) FROM book_ratings WHERE book_id = ${bookId} AND rating = 0)`,
      ratingNegative: sql`(SELECT count(*) FROM book_ratings WHERE book_id = ${bookId} AND rating = -1)`,
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
    return NextResponse.json({ rating: null });
  }

  const [row] = await db
    .select({ rating: bookRatings.rating })
    .from(bookRatings)
    .where(and(eq(bookRatings.userId, session.user.dbId), eq(bookRatings.bookId, bookId)))
    .limit(1);

  return NextResponse.json({ rating: row?.rating ?? null });
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
  const rating = body.rating;
  if (![-1, 0, 1].includes(rating)) {
    return NextResponse.json({ error: "Rating must be -1, 0, or 1" }, { status: 400 });
  }

  // Upsert the rating
  await db
    .insert(bookRatings)
    .values({ userId: session.user.dbId, bookId, rating })
    .onConflictDoUpdate({
      target: [bookRatings.userId, bookRatings.bookId],
      set: { rating, updatedAt: new Date() },
    });

  await refreshRatingStats(bookId);

  return NextResponse.json({ rating });
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
    .delete(bookRatings)
    .where(and(eq(bookRatings.userId, session.user.dbId), eq(bookRatings.bookId, bookId)));

  await refreshRatingStats(bookId);

  return NextResponse.json({ success: true });
}
