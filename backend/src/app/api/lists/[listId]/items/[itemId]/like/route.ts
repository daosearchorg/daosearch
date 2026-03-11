import { auth } from "@/auth";
import { db } from "@/db";
import { bookListItems, bookListItemLikes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ listId: string; itemId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { listId, itemId } = await params;
  const listIdNum = Number(listId);
  const itemIdNum = Number(itemId);
  if (isNaN(listIdNum) || isNaN(itemIdNum)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify item belongs to the list
  const [item] = await db
    .select({ id: bookListItems.id })
    .from(bookListItems)
    .where(
      and(
        eq(bookListItems.id, itemIdNum),
        eq(bookListItems.listId, listIdNum)
      )
    )
    .limit(1);

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await db
    .insert(bookListItemLikes)
    .values({ itemId: itemIdNum, userId: session.user.dbId })
    .onConflictDoNothing();

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { listId, itemId } = await params;
  const listIdNum = Number(listId);
  const itemIdNum = Number(itemId);
  if (isNaN(listIdNum) || isNaN(itemIdNum)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify item belongs to the list
  const [item] = await db
    .select({ id: bookListItems.id })
    .from(bookListItems)
    .where(
      and(
        eq(bookListItems.id, itemIdNum),
        eq(bookListItems.listId, listIdNum)
      )
    )
    .limit(1);

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await db
    .delete(bookListItemLikes)
    .where(
      and(
        eq(bookListItemLikes.itemId, itemIdNum),
        eq(bookListItemLikes.userId, session.user.dbId)
      )
    );

  return NextResponse.json({ success: true });
}
