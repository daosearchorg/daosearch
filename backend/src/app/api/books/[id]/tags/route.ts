import { auth } from "@/auth";
import { db } from "@/db";
import { tags, bookTags } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function normalizeTagName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function toDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.dbId ?? null;

  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      displayName: tags.displayName,
      count: sql<number>`count(distinct ${bookTags.userId})`,
    })
    .from(bookTags)
    .innerJoin(tags, eq(bookTags.tagId, tags.id))
    .where(eq(bookTags.bookId, bookId))
    .groupBy(tags.id, tags.name, tags.displayName)
    .orderBy(sql`count(distinct ${bookTags.userId}) DESC`)
    .limit(20);

  let userTagIds: number[] = [];
  if (userId) {
    const userRows = await db
      .select({ tagId: bookTags.tagId })
      .from(bookTags)
      .where(and(eq(bookTags.bookId, bookId), eq(bookTags.userId, userId)));
    userTagIds = userRows.map((r) => r.tagId);
  }

  return NextResponse.json({
    tags: rows.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      count: Number(r.count),
      userVoted: userTagIds.includes(r.id),
    })),
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.dbId;

  const body = await request.json();
  const rawName = body.tagName;
  if (!rawName || typeof rawName !== "string") {
    return NextResponse.json({ error: "tagName required" }, { status: 400 });
  }

  const name = normalizeTagName(rawName);
  if (name.length < 2) {
    return NextResponse.json({ error: "Tag too short" }, { status: 400 });
  }

  // Check user hasn't exceeded 5 tags on this book
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookTags)
    .where(and(eq(bookTags.bookId, bookId), eq(bookTags.userId, userId)));

  if (Number(countResult?.count ?? 0) >= 5) {
    return NextResponse.json({ error: "Max 5 tags per book" }, { status: 400 });
  }

  // Find or create tag
  let [tag] = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
  if (!tag) {
    const displayName = body.displayName
      ? String(body.displayName).trim().slice(0, 100)
      : toDisplayName(name);
    [tag] = await db
      .insert(tags)
      .values({ name, displayName, createdAt: new Date() })
      .onConflictDoNothing()
      .returning();
    if (!tag) {
      [tag] = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
    }
  }

  // Insert vote
  await db
    .insert(bookTags)
    .values({ bookId, tagId: tag.id, userId, createdAt: new Date() })
    .onConflictDoNothing();

  return NextResponse.json({ success: true, tagId: tag.id });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const tagId = Number(body.tagId);
  if (isNaN(tagId)) {
    return NextResponse.json({ error: "Invalid tagId" }, { status: 400 });
  }

  await db
    .delete(bookTags)
    .where(
      and(
        eq(bookTags.bookId, bookId),
        eq(bookTags.tagId, tagId),
        eq(bookTags.userId, session.user.dbId),
      ),
    );

  return NextResponse.json({ success: true });
}
