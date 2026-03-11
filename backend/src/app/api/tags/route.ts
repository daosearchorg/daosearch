import { db } from "@/db";
import { tags, bookTags } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const limit = Math.min(Number(searchParams.get("limit")) || 10, 20);

  const conditions = q
    ? sql`${tags.name} ILIKE ${q + "%"}`
    : sql`1=1`;

  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      displayName: tags.displayName,
      count: sql<number>`count(${bookTags.id})`,
    })
    .from(tags)
    .leftJoin(bookTags, eq(tags.id, bookTags.tagId))
    .where(conditions)
    .groupBy(tags.id, tags.name, tags.displayName)
    .orderBy(sql`count(${bookTags.id}) DESC`)
    .limit(limit);

  return NextResponse.json({
    tags: rows.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      count: Number(r.count),
    })),
  });
}
