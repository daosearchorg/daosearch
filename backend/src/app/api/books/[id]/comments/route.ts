import { db } from "@/db";
import { bookComments, qqUsers } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
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

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookComments.id,
        title: bookComments.title,
        titleTranslated: bookComments.titleTranslated,
        content: bookComments.content,
        contentTranslated: bookComments.contentTranslated,
        images: bookComments.images,
        agreeCount: bookComments.agreeCount,
        replyCount: bookComments.replyCount,
        commentCreatedAt: bookComments.commentCreatedAt,
        qqUserNickname: qqUsers.nickname,
        qqUserNicknameTranslated: qqUsers.nicknameTranslated,
        qqUserIconUrl: qqUsers.iconUrl,
      })
      .from(bookComments)
      .innerJoin(qqUsers, eq(bookComments.qqUserId, qqUsers.id))
      .where(eq(bookComments.bookId, bookId))
      .orderBy(desc(bookComments.agreeCount))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookComments)
      .where(eq(bookComments.bookId, bookId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  // Strip Qidian emot tags like [emot=default,80/]
  const emot = /\[emot=[^\]]*\/?\]/g;
  const cleanedItems = items.map((item) => ({
    ...item,
    content: item.content?.replace(emot, "").trim() ?? null,
    contentTranslated: item.contentTranslated?.replace(emot, "").trim() ?? null,
  }));

  return NextResponse.json({
    items: cleanedItems,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
}
