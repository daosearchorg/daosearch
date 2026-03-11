import { auth } from "@/auth";
import { db } from "@/db";
import { bookLists, bookListItems } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: bookLists.id,
      name: bookLists.name,
      description: bookLists.description,
      isPublic: bookLists.isPublic,
      itemCount: count(bookListItems.id),
      createdAt: bookLists.createdAt,
      updatedAt: bookLists.updatedAt,
    })
    .from(bookLists)
    .leftJoin(bookListItems, eq(bookListItems.listId, bookLists.id))
    .where(eq(bookLists.userId, session.user.dbId))
    .groupBy(bookLists.id)
    .orderBy(bookLists.updatedAt);

  return NextResponse.json({ lists: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = body.name?.trim();
  if (!name || name.length > 255) {
    return NextResponse.json({ error: "Name is required (max 255 chars)" }, { status: 400 });
  }

  // Check limit
  const [{ value: listCount }] = await db
    .select({ value: count() })
    .from(bookLists)
    .where(eq(bookLists.userId, session.user.dbId));

  if (listCount >= 50) {
    return NextResponse.json({ error: "Maximum 50 lists allowed" }, { status: 400 });
  }

  const [created] = await db
    .insert(bookLists)
    .values({
      userId: session.user.dbId,
      name,
      description: body.description?.trim() || null,
    })
    .returning();

  return NextResponse.json({ list: created }, { status: 201 });
}
