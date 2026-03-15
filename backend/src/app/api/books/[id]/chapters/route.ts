import { db } from "@/db";
import { chapters } from "@/db/schema";
import { eq, sql, asc } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PAGE_SIZE = 100;

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";

  if (all) {
    const items = await db
      .select({
        id: chapters.id,
        sequenceNumber: chapters.sequenceNumber,
        title: chapters.title,
        titleTranslated: chapters.titleTranslated,
        url: chapters.url,
        locked: chapters.locked,
      })
      .from(chapters)
      .where(eq(chapters.bookId, bookId))
      .orderBy(asc(chapters.sequenceNumber));

    return NextResponse.json({ items, total: items.length });
  }

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: chapters.id,
        sequenceNumber: chapters.sequenceNumber,
        title: chapters.title,
        titleTranslated: chapters.titleTranslated,
        url: chapters.url,
        locked: chapters.locked,
      })
      .from(chapters)
      .where(eq(chapters.bookId, bookId))
      .orderBy(asc(chapters.sequenceNumber))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(chapters)
      .where(eq(chapters.bookId, bookId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return NextResponse.json({
    items,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
}
