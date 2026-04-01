import { db } from "@/db";
import { books, genres, bookStats, readingProgressHistories } from "@/db/schema";
import { eq, and, sql, asc, desc, isNotNull, inArray, type SQL } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { LIBRARY_PAGE_SIZE, type LibrarySort, type PopularityPeriod } from "../constants";

// ============================================================================
// Library / search queries
// ============================================================================

interface LibraryParams {
  name?: string;
  author?: string;
  exactMatch?: boolean;
  genreId?: number;
  subgenreId?: number;
  bookIds?: number[];
  minWords?: number;
  maxWords?: number;
  status?: string;
  gender?: string;
  updatedWithin?: number;
  olderThan?: number;
  tagIds?: number[];
  sort?: LibrarySort | "relevance";
  popularityPeriod?: PopularityPeriod;
  order?: "asc" | "desc";
  page: number;
}

export function getPopularityCutoff(period: PopularityPeriod): string | null {
  if (period === "all_time") return null;
  const d = new Date();
  if (period === "daily") d.setDate(d.getDate() - 1);
  else if (period === "weekly") d.setDate(d.getDate() - 7);
  else if (period === "monthly") d.setDate(d.getDate() - 30);
  return d.toISOString();
}

// Cached total count for default library landing (no filters) — avoids count(*) on every page load
export const getLibraryDefaultCount = unstable_cache(
  async () => {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(books)
      .leftJoin(genres, eq(books.genreId, genres.id))
      .where(and(isNotNull(books.title), eq(genres.blacklisted, false)));
    return Number((result as { count: number }[])[0]?.count ?? 0);
  },
  ["library-default-count"],
  { revalidate: 900 },
);

export async function getLibraryBooks(params: LibraryParams) {
  const {
    name, author, exactMatch, genreId, subgenreId, bookIds,
    minWords, maxWords, status, gender,
    updatedWithin, olderThan, tagIds,
    sort = "updated", popularityPeriod = "weekly", order = "desc", page,
  } = params;

  const maxPage = 200; // Cap at 10,000 results to prevent deep pagination abuse
  const safePage = Math.min(page, maxPage);
  const offset = (safePage - 1) * LIBRARY_PAGE_SIZE;
  // Build WHERE conditions
  const conditions: SQL[] = [
    isNotNull(books.title),
    eq(genres.blacklisted, false),
  ];

  if (name) {
    if (exactMatch) {
      conditions.push(sql`(
        ${books.titleTranslated} ILIKE ${name}
        OR ${books.title} ILIKE ${name}
      )`);
    } else {
      conditions.push(sql`(
        ${books.titleTranslated} ILIKE ${`%${name}%`}
        OR ${books.title} ILIKE ${`%${name}%`}
        OR similarity(${books.titleTranslated}, ${name}) > 0.15
        OR similarity(${books.title}, ${name}) > 0.15
      )`);
    }
  }
  if (author) {
    if (exactMatch) {
      conditions.push(sql`(
        ${books.authorTranslated} ILIKE ${author}
        OR ${books.author} ILIKE ${author}
      )`);
    } else {
      conditions.push(sql`(
        ${books.authorTranslated} ILIKE ${`%${author}%`}
        OR ${books.author} ILIKE ${`%${author}%`}
        OR similarity(${books.authorTranslated}, ${author}) > 0.15
        OR similarity(${books.author}, ${author}) > 0.15
      )`);
    }
  }
  if (genreId) {
    conditions.push(eq(books.genreId, genreId));
  }
  if (subgenreId) {
    conditions.push(eq(books.subgenreId, subgenreId));
  }
  if (bookIds && bookIds.length > 0) {
    conditions.push(inArray(books.id, bookIds));
  }
  if (minWords != null) {
    conditions.push(sql`COALESCE(${books.wordCount}, 0) >= ${minWords}`);
  }
  if (maxWords != null) {
    conditions.push(sql`COALESCE(${books.wordCount}, 0) <= ${maxWords}`);
  }
  if (status) {
    conditions.push(eq(books.status, status));
  }
  if (gender) {
    const sexAttr = gender === "male" ? 1 : gender === "female" ? 2 : null;
    if (sexAttr != null) {
      conditions.push(eq(books.sexAttr, sexAttr));
    }
  }
  if (updatedWithin) {
    conditions.push(sql`${books.updateTime} >= NOW() - make_interval(days => ${updatedWithin})`);
  }
  if (olderThan) {
    conditions.push(sql`${books.updateTime} < NOW() - make_interval(days => ${olderThan})`);
  }
  if (tagIds && tagIds.length > 0) {
    for (const tagId of tagIds) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM book_tags bt
          WHERE bt.book_id = ${books.id} AND bt.tag_id = ${tagId}
          GROUP BY bt.book_id
          HAVING count(distinct bt.user_id) >= 2
        )`,
      );
    }
  }

  const whereClause = and(...conditions)!;

  // Build sort expression
  const sortExpressions: Record<string, SQL> = {
    updated: sql`COALESCE(${books.updateTime}, '1970-01-01'::timestamptz)`,
    newest: sql`${books.createdAt}`,
    popularity: sql`COALESCE(${bookStats.readerCount}, 0)`,
    qq_score: sql`CASE WHEN ${books.qqScore} ~ '^[0-9]+\\.?[0-9]*$' THEN ${books.qqScore}::float ELSE 0 END`,
    community_score: sql`CASE WHEN COALESCE(${bookStats.ratingCount}, 0) > 0 THEN ${bookStats.ratingPositive}::float / ${bookStats.ratingCount} ELSE 0 END`,
    word_count: sql`COALESCE(${books.wordCount}, 0)`,
    favorites: sql`COALESCE(${books.qqFavoriteCount}, 0)`,
    fans: sql`COALESCE(${books.qqFanCount}, 0)`,
    bookmarks: sql`COALESCE(${bookStats.bookmarkCount}, 0)`,
  };

  const orderFn = order === "asc" ? asc : desc;

  // For popularity sort with time-based period, use a subquery
  const needsPopularitySubquery = sort === "popularity" && popularityPeriod !== "all_time";
  const popCutoff = needsPopularitySubquery ? getPopularityCutoff(popularityPeriod) : null;

  const readerCounts = needsPopularitySubquery
    ? db
        .select({
          bookId: readingProgressHistories.bookId,
          readerCount: sql<number>`count(distinct ${readingProgressHistories.userId})`.as("active_reader_count"),
        })
        .from(readingProgressHistories)
        .where(sql`${readingProgressHistories.recordedAt} >= ${popCutoff}`)
        .groupBy(readingProgressHistories.bookId)
        .as("rc")
    : null;

  const selectFields = {
    bookId: books.id,
    title: books.title,
    titleTranslated: books.titleTranslated,
    author: books.author,
    authorTranslated: books.authorTranslated,
    imageUrl: books.imageUrl,
    synopsis: books.synopsis,
    synopsisTranslated: books.synopsisTranslated,
    genreName: genres.name,
    genreNameTranslated: genres.nameTranslated,
    chapterCount: bookStats.chapterCount,
    commentCount: bookStats.commentCount,
    ratingCount: bookStats.ratingCount,
    ratingPositive: bookStats.ratingPositive,
    ratingNeutral: bookStats.ratingNeutral,
    ratingNegative: bookStats.ratingNegative,
    reviewCount: bookStats.reviewCount,
    readerCount: bookStats.readerCount,
    wordCount: books.wordCount,
    qqScore: books.qqScore,
  };

  // Build relevance expression based on search terms
  const hasSearch = !!(name || author);
  const relevanceExpr = hasSearch
    ? sql`(
        ${name ? sql`GREATEST(
          COALESCE(similarity(${books.titleTranslated}, ${name}), 0),
          COALESCE(similarity(${books.title}, ${name}), 0)
        )` : sql`0`}
        +
        ${author ? sql`GREATEST(
          COALESCE(similarity(${books.authorTranslated}, ${author}), 0),
          COALESCE(similarity(${books.author}, ${author}), 0)
        )` : sql`0`}
      )`
    : null;

  let sortColumn: SQL;
  if (sort === "relevance" && relevanceExpr) {
    sortColumn = relevanceExpr;
  } else if (needsPopularitySubquery) {
    sortColumn = sql`COALESCE("rc"."active_reader_count", 0)`;
  } else {
    sortColumn = sortExpressions[sort] ?? sortExpressions.updated;
  }

  const baseQuery = db
    .select(selectFields)
    .from(books)
    .leftJoin(genres, eq(books.genreId, genres.id))
    .leftJoin(bookStats, eq(books.id, bookStats.bookId));

  // Use cached count for default landing (no user filters) — avoids expensive count(*) on 1M+ rows
  const hasFilters = !!(name || author || genreId || subgenreId || (bookIds && bookIds.length > 0) || minWords != null || maxWords != null || status || gender || updatedWithin || olderThan || (tagIds && tagIds.length > 0));

  const countQuery = hasFilters
    ? db
        .select({ count: sql<number>`count(*)` })
        .from(books)
        .leftJoin(genres, eq(books.genreId, genres.id))
        .leftJoin(bookStats, eq(books.id, bookStats.bookId))
        .where(whereClause)
    : null;

  if (readerCounts) {
    const [items, total] = await Promise.all([
      baseQuery
        .leftJoin(readerCounts, eq(books.id, readerCounts.bookId))
        .where(whereClause)
        .orderBy(orderFn(sortColumn), desc(books.id))
        .limit(LIBRARY_PAGE_SIZE)
        .offset(offset),
      countQuery
        ? countQuery.then((r) => Number((r as { count: number }[])[0]?.count ?? 0))
        : getLibraryDefaultCount(),
    ]);
    return { items, total, totalPages: Math.ceil(total / LIBRARY_PAGE_SIZE) };
  }

  const [items, total] = await Promise.all([
    baseQuery
      .where(whereClause)
      .orderBy(orderFn(sortColumn), desc(books.id))
      .limit(LIBRARY_PAGE_SIZE)
      .offset(offset),
    countQuery
      ? countQuery.then((r) => Number((r as { count: number }[])[0]?.count ?? 0))
      : getLibraryDefaultCount(),
  ]);

  return { items, total, totalPages: Math.ceil(total / LIBRARY_PAGE_SIZE) };
}

// Quick search — lightweight title search returning 5 results for navbar autocomplete
export async function quickSearchBooks(query: string) {
  if (!query.trim()) return [];

  const term = query.trim();
  return db
    .select({
      id: books.id,
      title: books.title,
      titleTranslated: books.titleTranslated,
      author: books.author,
      authorTranslated: books.authorTranslated,
      imageUrl: books.imageUrl,
      genreName: genres.nameTranslated,
    })
    .from(books)
    .leftJoin(genres, eq(books.genreId, genres.id))
    .where(
      and(
        isNotNull(books.title),
        eq(genres.blacklisted, false),
        sql`(
          ${books.titleTranslated} ILIKE ${`%${term}%`}
          OR ${books.title} ILIKE ${`%${term}%`}
          OR similarity(${books.titleTranslated}, ${term}) > 0.15
          OR similarity(${books.title}, ${term}) > 0.15
        )`,
      ),
    )
    .orderBy(
      desc(sql`GREATEST(
        COALESCE(similarity(${books.titleTranslated}, ${term}), 0),
        COALESCE(similarity(${books.title}, ${term}), 0)
      )`),
    )
    .limit(5);
}
