import { db } from "@/db";
import { books, genres } from "@/db/schema";
import { eq, and, sql, asc, isNotNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

// ============================================================================
// Genre queries
// ============================================================================

export const getAllGenres = unstable_cache(
  async () => {
    return db
      .select({
        id: genres.id,
        name: genres.name,
        nameTranslated: genres.nameTranslated,
      })
      .from(genres)
      .where(eq(genres.blacklisted, false))
      .orderBy(asc(sql`COALESCE(${genres.nameTranslated}, ${genres.name})`));
  },
  ["all-genres"],
  { revalidate: 86400 },
);

export const getPrimaryGenres = unstable_cache(
  async () => {
    return db
      .select({
        id: genres.id,
        name: genres.name,
        nameTranslated: genres.nameTranslated,
      })
      .from(genres)
      .innerJoin(books, eq(books.genreId, genres.id))
      .where(eq(genres.blacklisted, false))
      .groupBy(genres.id, genres.name, genres.nameTranslated)
      .orderBy(asc(sql`COALESCE(${genres.nameTranslated}, ${genres.name})`));
  },
  ["primary-genres"],
  { revalidate: 86400 },
);

export const getSubgenres = unstable_cache(
  async () => {
    return db
      .select({
        id: genres.id,
        name: genres.name,
        nameTranslated: genres.nameTranslated,
      })
      .from(genres)
      .innerJoin(books, eq(books.subgenreId, genres.id))
      .where(eq(genres.blacklisted, false))
      .groupBy(genres.id, genres.name, genres.nameTranslated)
      .orderBy(asc(sql`COALESCE(${genres.nameTranslated}, ${genres.name})`));
  },
  ["subgenres"],
  { revalidate: 86400 },
);

export const getGenreSubgenrePairs = unstable_cache(
  async () => {
    const rows = await db
      .select({
        genreId: books.genreId,
        subgenreId: books.subgenreId,
      })
      .from(books)
      .where(and(isNotNull(books.genreId), isNotNull(books.subgenreId)))
      .groupBy(books.genreId, books.subgenreId);

    // Build bidirectional maps: genreId -> Set<subgenreId> and subgenreId -> Set<genreId>
    const genreToSub: Record<number, number[]> = {};
    const subToGenre: Record<number, number[]> = {};
    for (const { genreId, subgenreId } of rows) {
      if (genreId == null || subgenreId == null) continue;
      (genreToSub[genreId] ??= []).push(subgenreId);
      (subToGenre[subgenreId] ??= []).push(genreId);
    }
    return { genreToSub, subToGenre };
  },
  ["genre-subgenre-pairs"],
  { revalidate: 86400 },
);
