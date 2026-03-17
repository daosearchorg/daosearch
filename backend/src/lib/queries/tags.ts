import { db } from "@/db";
import { tags, bookTags, booklistTags } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { unstable_cache } from "next/cache";

// ============================================================================
// Community Tags queries
// ============================================================================

export async function getBookTags(bookId: number) {
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
    .orderBy(desc(sql`count(distinct ${bookTags.userId})`))
    .limit(20);

  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

export const getPopularTags = unstable_cache(
  async () => {
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        displayName: tags.displayName,
        count: sql<number>`count(distinct ${bookTags.userId})`,
      })
      .from(tags)
      .leftJoin(bookTags, eq(tags.id, bookTags.tagId))
      .groupBy(tags.id, tags.name, tags.displayName)
      .having(sql`count(distinct ${bookTags.userId}) >= 2`)
      .orderBy(desc(sql`count(distinct ${bookTags.userId})`));

    return rows.map((r) => ({ ...r, count: Number(r.count) }));
  },
  ["popular-tags"],
  { revalidate: 3600 },
);

export async function getBooklistTags(listId: number) {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      displayName: tags.displayName,
      count: sql<number>`count(distinct ${booklistTags.userId})`,
    })
    .from(booklistTags)
    .innerJoin(tags, eq(booklistTags.tagId, tags.id))
    .where(eq(booklistTags.listId, listId))
    .groupBy(tags.id, tags.name, tags.displayName)
    .orderBy(desc(sql`count(distinct ${booklistTags.userId})`))
    .limit(20);

  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}
