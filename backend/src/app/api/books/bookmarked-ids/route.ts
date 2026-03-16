import { auth } from "@/auth";
import { db } from "@/db";
import { bookmarks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ ids: [] });
  }

  const rows = await db
    .select({ bookId: bookmarks.bookId })
    .from(bookmarks)
    .where(eq(bookmarks.userId, session.user.dbId));

  return NextResponse.json({ ids: rows.map((r) => r.bookId) });
}
