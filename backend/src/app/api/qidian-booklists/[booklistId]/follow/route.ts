import { auth } from "@/auth";
import { db } from "@/db";
import { qidianBooklists, qidianBooklistFollows } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ booklistId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { booklistId } = await params;
  const id = Number(booklistId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid booklist ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check booklist exists
  const [booklist] = await db
    .select({ id: qidianBooklists.id })
    .from(qidianBooklists)
    .where(eq(qidianBooklists.id, id))
    .limit(1);

  if (!booklist) {
    return NextResponse.json({ error: "Booklist not found" }, { status: 404 });
  }

  const inserted = await db
    .insert(qidianBooklistFollows)
    .values({ booklistId: id, userId: session.user.dbId })
    .onConflictDoNothing()
    .returning({ id: qidianBooklistFollows.id });

  if (inserted.length > 0) {
    await db
      .update(qidianBooklists)
      .set({ daosearchFollowerCount: sql`daosearch_follower_count + 1` })
      .where(eq(qidianBooklists.id, id));
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { booklistId } = await params;
  const id = Number(booklistId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid booklist ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await db
    .delete(qidianBooklistFollows)
    .where(
      and(
        eq(qidianBooklistFollows.booklistId, id),
        eq(qidianBooklistFollows.userId, session.user.dbId)
      )
    )
    .returning({ id: qidianBooklistFollows.id });

  if (deleted.length > 0) {
    await db
      .update(qidianBooklists)
      .set({ daosearchFollowerCount: sql`GREATEST(daosearch_follower_count - 1, 0)` })
      .where(eq(qidianBooklists.id, id));
  }

  return NextResponse.json({ success: true });
}
