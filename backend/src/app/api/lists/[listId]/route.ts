import { auth } from "@/auth";
import { db } from "@/db";
import { bookLists, bookListItems, books } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ listId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { listId } = await params;
  const id = Number(listId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [list] = await db
    .select()
    .from(bookLists)
    .where(and(eq(bookLists.id, id), eq(bookLists.userId, session.user.dbId)))
    .limit(1);

  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const items = await db
    .select({
      id: bookListItems.id,
      bookId: books.id,
      title: books.title,
      titleTranslated: books.titleTranslated,
      author: books.author,
      authorTranslated: books.authorTranslated,
      imageUrl: books.imageUrl,
      addedAt: bookListItems.addedAt,
    })
    .from(bookListItems)
    .innerJoin(books, eq(bookListItems.bookId, books.id))
    .where(eq(bookListItems.listId, id))
    .orderBy(bookListItems.addedAt);

  return NextResponse.json({ list, items });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { listId } = await params;
  const id = Number(listId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) {
    const name = body.name?.trim();
    if (!name || name.length > 255) {
      return NextResponse.json({ error: "Name is required (max 255 chars)" }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.description !== undefined) {
    updates.description = body.description?.trim() || null;
  }
  if (body.isPublic !== undefined) {
    const isPublic = body.isPublic === 1 ? 1 : 0;
    updates.isPublic = isPublic;
  }

  const [updated] = await db
    .update(bookLists)
    .set(updates)
    .where(and(eq(bookLists.id, id), eq(bookLists.userId, session.user.dbId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  return NextResponse.json({ list: updated });
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

  const [deleted] = await db
    .delete(bookLists)
    .where(and(eq(bookLists.id, id), eq(bookLists.userId, session.user.dbId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
