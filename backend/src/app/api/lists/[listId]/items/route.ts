import { auth } from "@/auth";
import { db } from "@/db";
import { bookLists, bookListItems, bookListFollows } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createNotificationsBulk } from "@/lib/notifications";

interface RouteParams {
  params: Promise<{ listId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { listId } = await params;
  const id = Number(listId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const [list] = await db
    .select({ id: bookLists.id, name: bookLists.name, isPublic: bookLists.isPublic })
    .from(bookLists)
    .where(and(eq(bookLists.id, id), eq(bookLists.userId, session.user.dbId)))
    .limit(1);

  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const body = await request.json();
  const bookId = Number(body.bookId);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const inserted = await db
    .insert(bookListItems)
    .values({ listId: id, bookId })
    .onConflictDoNothing()
    .returning({ id: bookListItems.id });

  if (inserted.length > 0) {
    await db
      .update(bookLists)
      .set({ updatedAt: new Date(), itemCount: sql`item_count + 1` })
      .where(eq(bookLists.id, id));

    // Notify followers of this list (fire-and-forget)
    if (list.isPublic) {
      (async () => {
        try {
          const followers = await db
            .select({ userId: bookListFollows.userId })
            .from(bookListFollows)
            .where(eq(bookListFollows.listId, id));

          if (followers.length > 0) {
            await createNotificationsBulk(
              followers.map((f) => ({
                userId: f.userId,
                actorId: session.user.dbId,
                type: "list_item_added",
                metadata: { listId: id, listName: list.name },
              }))
            );
          }
        } catch {
          // ignore
        }
      })();
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { listId } = await params;
  const id = Number(listId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const [list] = await db
    .select({ id: bookLists.id })
    .from(bookLists)
    .where(and(eq(bookLists.id, id), eq(bookLists.userId, session.user.dbId)))
    .limit(1);

  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const body = await request.json();
  const bookId = Number(body.bookId);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const deleted = await db
    .delete(bookListItems)
    .where(and(eq(bookListItems.listId, id), eq(bookListItems.bookId, bookId)))
    .returning({ id: bookListItems.id });

  if (deleted.length > 0) {
    await db
      .update(bookLists)
      .set({ updatedAt: new Date(), itemCount: sql`GREATEST(item_count - 1, 0)` })
      .where(eq(bookLists.id, id));
  }

  return NextResponse.json({ success: true });
}
