import { db } from "@/db";
import { tags, bookTags, booklistTags } from "@/db/schema";
import { eq, sql, desc, inArray } from "drizzle-orm";
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

// Resolves a list of community-tag displayNames (case-insensitive) to a Map
// keyed by the lowercased displayName → tag id. Lets Qidian booklist tags
// (scraped text[] arrays without ids) deep-link to /library?tag=<id> when a
// matching community tag exists; unmatched names fall back to a different
// route at the call site.
export async function resolveTagsByDisplayName(names: string[]): Promise<Map<string, number>> {
  if (!names.length) return new Map();
  const lowered = Array.from(
    new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean)),
  );
  if (!lowered.length) return new Map();
  // Use `IN (...)` rather than `ANY($1::text[])` — Drizzle's sql`...${array}`
  // flattens the array into N positional params, which postgres rejects when
  // cast as text[]. inArray() generates valid `IN ($1, $2, ...)`.
  const rows = await db
    .select({ id: tags.id, displayName: tags.displayName })
    .from(tags)
    .where(inArray(sql<string>`lower(${tags.displayName})`, lowered));
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.displayName.toLowerCase(), row.id);
  }
  return map;
}

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
