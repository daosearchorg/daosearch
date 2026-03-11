import { auth } from "@/auth";
import { db } from "@/db";
import { reviewLikes, bookReviews, books } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";

interface RouteParams {
  params: Promise<{ reviewId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { reviewId } = await params;
  const revId = Number(reviewId);
  if (isNaN(revId)) {
    return NextResponse.json({ error: "Invalid review ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inserted = await db
    .insert(reviewLikes)
    .values({ userId: session.user.dbId, reviewId: revId })
    .onConflictDoNothing()
    .returning({ id: reviewLikes.id });

  if (inserted.length > 0) {
    // Look up review owner and book title for notification
    const [review] = await db
      .select({
        userId: bookReviews.userId,
        bookId: bookReviews.bookId,
        bookTitle: books.titleTranslated,
      })
      .from(bookReviews)
      .innerJoin(books, eq(bookReviews.bookId, books.id))
      .where(eq(bookReviews.id, revId))
      .limit(1);

    if (review) {
      createNotification({
        userId: review.userId,
        actorId: session.user.dbId,
        type: "review_liked",
        metadata: {
          reviewId: revId,
          bookId: review.bookId,
          bookTitle: review.bookTitle || "Unknown",
        },
      }).catch(() => {});
    }
  }

  return NextResponse.json({ liked: true });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { reviewId } = await params;
  const revId = Number(reviewId);
  if (isNaN(revId)) {
    return NextResponse.json({ error: "Invalid review ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(reviewLikes)
    .where(and(eq(reviewLikes.userId, session.user.dbId), eq(reviewLikes.reviewId, revId)));

  return NextResponse.json({ liked: false });
}
