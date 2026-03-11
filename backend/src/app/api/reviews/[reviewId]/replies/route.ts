import { auth } from "@/auth";
import { db } from "@/db";
import { reviewReplies, bookReviews, books, users } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
import { parseMentions } from "@/lib/notifications";

interface RouteParams {
  params: Promise<{ reviewId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { reviewId } = await params;
  const revId = Number(reviewId);
  if (isNaN(revId)) {
    return NextResponse.json({ error: "Invalid review ID" }, { status: 400 });
  }

  const replies = await db
    .select({
      id: reviewReplies.id,
      userId: reviewReplies.userId,
      replyText: reviewReplies.replyText,
      createdAt: reviewReplies.createdAt,
      userDisplayName: users.publicUsername,
      userAvatarUrl: users.publicAvatarUrl,
    })
    .from(reviewReplies)
    .innerJoin(users, eq(reviewReplies.userId, users.id))
    .where(eq(reviewReplies.reviewId, revId))
    .orderBy(asc(reviewReplies.createdAt));

  return NextResponse.json(replies);
}

export async function POST(request: Request, { params }: RouteParams) {
  const { reviewId } = await params;
  const revId = Number(reviewId);
  if (isNaN(revId)) {
    return NextResponse.json({ error: "Invalid review ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const replyText = typeof body.replyText === "string" ? body.replyText.trim() : "";
  if (replyText.length < 1 || replyText.length > 2000) {
    return NextResponse.json({ error: "Reply must be 1-2000 characters" }, { status: 400 });
  }

  const [row] = await db
    .insert(reviewReplies)
    .values({ reviewId: revId, userId: session.user.dbId, replyText })
    .returning({
      id: reviewReplies.id,
      userId: reviewReplies.userId,
      replyText: reviewReplies.replyText,
      createdAt: reviewReplies.createdAt,
    });

  // Notify review owner + @mentioned users (fire-and-forget)
  (async () => {
    try {
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

      if (!review) return;

      const meta = {
        reviewId: revId,
        replyId: row.id,
        bookId: review.bookId,
        bookTitle: review.bookTitle || "Unknown",
      };

      // Notify review owner
      await createNotification({
        userId: review.userId,
        actorId: session.user.dbId,
        type: "review_replied",
        metadata: meta,
      });

      // Handle @mentions
      const mentionedUsernames = parseMentions(replyText);
      if (mentionedUsernames.length > 0) {
        const mentionedUsers = await db
          .select({ id: users.id, publicUsername: users.publicUsername })
          .from(users)
          .where(inArray(users.publicUsername, mentionedUsernames));

        for (const u of mentionedUsers) {
          // Skip self and review owner (already notified)
          if (u.id === session.user.dbId || u.id === review.userId) continue;
          await createNotification({
            userId: u.id,
            actorId: session.user.dbId,
            type: "mention",
            metadata: meta,
          });
        }
      }
    } catch {
      // Notification errors shouldn't break the reply
    }
  })();

  return NextResponse.json({
    ...row,
    userDisplayName: session.user.publicUsername ?? session.user.name ?? "You",
    userAvatarUrl: session.user.publicAvatarUrl ?? null,
  });
}
