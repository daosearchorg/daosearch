import { auth } from "@/auth";
import { db } from "@/db";
import { bookReviews, bookRatings, bookStats, users } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

const PAGE_SIZE = 10;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const session = await auth();
  const currentUserId = session?.user?.dbId ?? null;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookReviews.id,
        userId: bookReviews.userId,
        reviewText: bookReviews.reviewText,
        createdAt: bookReviews.createdAt,
        userDisplayName: users.publicUsername,
        userAvatarUrl: users.publicAvatarUrl,
        rating: bookRatings.rating,
        likeCount: sql<number>`(SELECT count(*) FROM review_likes WHERE review_id = ${bookReviews.id})`,
        replyCount: sql<number>`(SELECT count(*) FROM review_replies WHERE review_id = ${bookReviews.id})`,
        userHasLiked: currentUserId
          ? sql<boolean>`EXISTS (SELECT 1 FROM review_likes WHERE review_id = ${bookReviews.id} AND user_id = ${currentUserId})`
          : sql<boolean>`false`,
      })
      .from(bookReviews)
      .innerJoin(users, eq(bookReviews.userId, users.id))
      .leftJoin(
        bookRatings,
        and(
          eq(bookRatings.userId, bookReviews.userId),
          eq(bookRatings.bookId, bookReviews.bookId),
        ),
      )
      .where(eq(bookReviews.bookId, bookId))
      .orderBy(desc(bookReviews.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookReviews)
      .where(eq(bookReviews.bookId, bookId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return NextResponse.json({
    items,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
}

async function refreshReviewCount(bookId: number) {
  await db
    .update(bookStats)
    .set({
      reviewCount: sql`(SELECT count(*) FROM book_reviews WHERE book_id = ${bookId})`,
      updatedAt: new Date(),
    })
    .where(eq(bookStats.bookId, bookId));
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

  const body = await request.json();
  const reviewText = typeof body.reviewText === "string" ? body.reviewText.trim() : "";
  if (reviewText.length < 1 || reviewText.length > 5000) {
    return NextResponse.json({ error: "Review must be 1-5000 characters" }, { status: 400 });
  }

  const [row] = await db
    .insert(bookReviews)
    .values({ userId: session.user.dbId, bookId, reviewText })
    .onConflictDoUpdate({
      target: [bookReviews.userId, bookReviews.bookId],
      set: { reviewText, updatedAt: new Date() },
    })
    .returning({ id: bookReviews.id });

  await refreshReviewCount(bookId);

  return NextResponse.json({ id: row.id, reviewText });
}
