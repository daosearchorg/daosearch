import { auth } from "@/auth";
import { db } from "@/db";
import { userBookEntities, userGeneralEntities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

// POST: Copy a book entity to the user's general glossary
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bookEntityId } = body;

  if (!bookEntityId) {
    return NextResponse.json(
      { error: "bookEntityId is required" },
      { status: 400 },
    );
  }

  // Fetch the book entity
  const [bookEntity] = await db
    .select()
    .from(userBookEntities)
    .where(
      and(
        eq(userBookEntities.id, Number(bookEntityId)),
        eq(userBookEntities.userId, session.user.dbId),
      ),
    );

  if (!bookEntity) {
    return NextResponse.json({ error: "Book entity not found" }, { status: 404 });
  }

  // Upsert into general entities
  await db
    .insert(userGeneralEntities)
    .values({
      userId: session.user.dbId,
      originalName: bookEntity.sourceTerm,
      translatedName: bookEntity.translatedTerm,
      gender: bookEntity.gender || "N",
    })
    .onConflictDoUpdate({
      target: [userGeneralEntities.userId, userGeneralEntities.originalName],
      set: {
        translatedName: bookEntity.translatedTerm,
        gender: bookEntity.gender || "N",
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}
