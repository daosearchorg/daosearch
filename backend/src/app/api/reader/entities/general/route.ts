import { auth } from "@/auth";
import { db } from "@/db";
import { userGeneralEntities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// GET: Return all general entities for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entities = await db
    .select()
    .from(userGeneralEntities)
    .where(eq(userGeneralEntities.userId, session.user.dbId));

  return NextResponse.json({ entities });
}

// POST: Create or update a general entity
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { originalName, translatedName, gender } = body;

  if (!originalName || !translatedName) {
    return NextResponse.json(
      { error: "originalName and translatedName are required" },
      { status: 400 },
    );
  }

  await db
    .insert(userGeneralEntities)
    .values({
      userId: session.user.dbId,
      originalName,
      translatedName,
      gender: gender || "N",
    })
    .onConflictDoUpdate({
      target: [userGeneralEntities.userId, userGeneralEntities.originalName],
      set: {
        translatedName,
        gender: gender || "N",
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}

// DELETE: Delete a single general entity
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
    .delete(userGeneralEntities)
    .where(
      and(
        eq(userGeneralEntities.id, id),
        eq(userGeneralEntities.userId, session.user.dbId),
      ),
    )
    .returning({ id: userGeneralEntities.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
