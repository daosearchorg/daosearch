import { auth } from "@/auth";
import { db } from "@/db";
import { bookLists, bookListFollows } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";

interface RouteParams {
  params: Promise<{ listId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { listId } = await params;
  const id = Number(listId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check list exists and is public
  const [list] = await db
    .select({ id: bookLists.id, isPublic: bookLists.isPublic, userId: bookLists.userId, name: bookLists.name })
    .from(bookLists)
    .where(eq(bookLists.id, id))
    .limit(1);

  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  if (!list.isPublic) {
    return NextResponse.json({ error: "List is not public" }, { status: 403 });
  }

  const inserted = await db
    .insert(bookListFollows)
    .values({ listId: id, userId: session.user.dbId })
    .onConflictDoNothing()
    .returning({ id: bookListFollows.id });

  if (inserted.length > 0) {
    await db
      .update(bookLists)
      .set({ followerCount: sql`follower_count + 1` })
      .where(eq(bookLists.id, id));

    createNotification({
      userId: list.userId,
      actorId: session.user.dbId,
      type: "list_followed",
      metadata: { listId: id, listName: list.name },
    }).catch(() => {});
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { listId } = await params;
  const id = Number(listId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await db
    .delete(bookListFollows)
    .where(
      and(
        eq(bookListFollows.listId, id),
        eq(bookListFollows.userId, session.user.dbId)
      )
    )
    .returning({ id: bookListFollows.id });

  if (deleted.length > 0) {
    await db
      .update(bookLists)
      .set({ followerCount: sql`GREATEST(follower_count - 1, 0)` })
      .where(eq(bookLists.id, id));
  }

  return NextResponse.json({ success: true });
}
