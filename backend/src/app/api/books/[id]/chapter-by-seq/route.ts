import { db } from "@/db";
import { chapters } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const seq = Number(url.searchParams.get("seq"));
  if (isNaN(seq) || seq < 1) {
    return NextResponse.json({ error: "Invalid seq parameter" }, { status: 400 });
  }

  const [row] = await db
    .select({ id: chapters.id, sequenceNumber: chapters.sequenceNumber })
    .from(chapters)
    .where(and(eq(chapters.bookId, bookId), eq(chapters.sequenceNumber, seq)))
    .limit(1);

  return NextResponse.json({
    id: row?.id ?? null,
    sequenceNumber: row?.sequenceNumber ?? null,
  });
}
