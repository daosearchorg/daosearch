import { auth } from "@/auth";
import { db } from "@/db";
import { userBookEntities } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { seedUserEntities } from "@/lib/queries";

// GET: Return entities for a book (user-scoped or community consensus for unauthenticated)
export async function GET(request: NextRequest) {
  const bookId = Number(request.nextUrl.searchParams.get("bookId"));
  if (!bookId) {
    return NextResponse.json({ error: "bookId is required" }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.dbId;

  if (userId) {
    // Seed from community if user has no entities for this book
    await seedUserEntities(userId, bookId);

    const entities = await db
      .select()
      .from(userBookEntities)
      .where(
        and(
          eq(userBookEntities.userId, userId),
          eq(userBookEntities.bookId, bookId),
        ),
      );

    return NextResponse.json({ entities });
  }

  // Unauthenticated: return community consensus entities
  const communityResult = await db.execute(sql`
    SELECT DISTINCT ON (source_term)
      source_term, translated_term, gender, category
    FROM user_book_entities
    WHERE book_id = ${bookId}
    GROUP BY source_term, translated_term, gender, category
    ORDER BY source_term, COUNT(*) DESC
  `);

  const rows = Array.isArray(communityResult) ? communityResult : [];

  return NextResponse.json({
    entities: rows.map((e: Record<string, unknown>) => ({
      id: null,
      sourceTerm: e.source_term,
      translatedTerm: e.translated_term,
      gender: e.gender || "N",
      category: e.category || "character",
    })),
  });
}

// POST: Bulk upsert entities
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bookId, entities } = body;

  if (!bookId || !Array.isArray(entities) || entities.length === 0) {
    return NextResponse.json(
      { error: "bookId and entities array are required" },
      { status: 400 },
    );
  }

  for (const entity of entities) {
    if (!entity.sourceTerm || !entity.translatedTerm) continue;

    await db
      .insert(userBookEntities)
      .values({
        userId: session.user.dbId,
        bookId: Number(bookId),
        sourceTerm: entity.sourceTerm,
        translatedTerm: entity.translatedTerm,
        gender: entity.gender || "N",
        category: entity.category || "character",
      })
      .onConflictDoUpdate({
        target: [
          userBookEntities.userId,
          userBookEntities.bookId,
          userBookEntities.sourceTerm,
        ],
        set: {
          translatedTerm: entity.translatedTerm,
          gender: entity.gender || "N",
          category: entity.category || "character",
          updatedAt: new Date(),
        },
      });
  }

  return NextResponse.json({ ok: true });
}

// PUT: Update a single entity
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, translatedTerm, gender, category } = body;

  if (!id || !translatedTerm) {
    return NextResponse.json(
      { error: "id and translatedTerm are required" },
      { status: 400 },
    );
  }

  const updated = await db
    .update(userBookEntities)
    .set({
      translatedTerm,
      gender: gender || "N",
      category: category || "character",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userBookEntities.id, Number(id)),
        eq(userBookEntities.userId, session.user.dbId),
      ),
    )
    .returning({ id: userBookEntities.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE: Delete a single entity
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const deleted = await db
    .delete(userBookEntities)
    .where(
      and(
        eq(userBookEntities.id, id),
        eq(userBookEntities.userId, session.user.dbId),
      ),
    )
    .returning({ id: userBookEntities.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
