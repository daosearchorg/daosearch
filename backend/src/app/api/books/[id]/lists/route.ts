import { auth } from "@/auth";
import { db } from "@/db";
import { bookLists, bookmarks } from "@/db/schema";
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
    return NextResponse.json({ bookmarked: false, lists: [] });
  }

  // Fetch bookmark status + user lists in parallel
  const [bookmarkRow, lists] = await Promise.all([
    db
      .select({ id: bookmarks.id, status: bookmarks.status })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, session.user.dbId), eq(bookmarks.bookId, bookId)))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({
        id: bookLists.id,
        name: bookLists.name,
        hasBook: sql<boolean>`EXISTS (
          SELECT 1 FROM book_list_items
          WHERE list_id = "book_lists"."id" AND book_id = ${bookId}
        )`,
      })
      .from(bookLists)
      .where(eq(bookLists.userId, session.user.dbId))
      .orderBy(bookLists.name),
  ]);

  return NextResponse.json({
    bookmarked: !!bookmarkRow,
    status: bookmarkRow?.status ?? null,
    lists,
  });
}
