import { auth } from "@/auth";
import { db } from "@/db";
import { bookReviews, bookStats } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string; reviewId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id, reviewId } = await params;
  const bookId = Number(id);
  const revId = Number(reviewId);
  if (isNaN(bookId) || isNaN(revId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const reviewText = typeof body.reviewText === "string" ? body.reviewText.trim() : "";
  if (reviewText.length < 1 || reviewText.length > 5000) {
    return NextResponse.json({ error: "Review must be 1-5000 characters" }, { status: 400 });
  }

  const updated = await db
    .update(bookReviews)
    .set({ reviewText, updatedAt: new Date() })
    .where(and(eq(bookReviews.id, revId), eq(bookReviews.userId, session.user.dbId)))
    .returning({ id: bookReviews.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Not found or not yours" }, { status: 404 });
  }

  return NextResponse.json({ id: revId, reviewText });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, reviewId } = await params;
  const bookId = Number(id);
  const revId = Number(reviewId);
  if (isNaN(bookId) || isNaN(revId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(bookReviews)
    .where(and(eq(bookReviews.id, revId), eq(bookReviews.userId, session.user.dbId)));

  await db
    .update(bookStats)
    .set({
      reviewCount: sql`(SELECT count(*) FROM book_reviews WHERE book_id = ${bookId})`,
      updatedAt: new Date(),
    })
    .where(eq(bookStats.bookId, bookId));

  return NextResponse.json({ success: true });
}
