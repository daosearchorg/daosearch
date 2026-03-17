import { db } from "@/db";
import { books, genres, bookStats, qqChartEntries, readingProgressHistories } from "@/db/schema";
import { eq, and, sql, asc, desc, type SQL } from "drizzle-orm";
import { PAGINATION_SIZE } from "../constants";

// ============================================================================
// Rankings queries
// ============================================================================

interface RankingsParams {
  gender: string;
  rankType: string;
  cycle: string;
  page: number;
  genreId?: number;
}

const RANKINGS_PAGE_SIZE = PAGINATION_SIZE;

export async function getRankings({ gender, rankType, cycle, page, genreId }: RankingsParams) {
  const offset = (page - 1) * RANKINGS_PAGE_SIZE;

  const conditionList: SQL[] = [
    eq(qqChartEntries.gender, gender),
    eq(qqChartEntries.rankType, rankType),
    eq(qqChartEntries.cycle, cycle),
  ];
  if (genreId) {
    conditionList.push(eq(books.genreId, genreId));
  }
  const conditions = and(...conditionList);

  const [items, countResult] = await Promise.all([
    db
      .select({
        position: qqChartEntries.position,
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
      })
      .from(qqChartEntries)
      .innerJoin(books, eq(qqChartEntries.bookId, books.id))
      .leftJoin(genres, eq(books.genreId, genres.id))
      .leftJoin(bookStats, eq(books.id, bookStats.bookId))
      .where(conditions)
      .orderBy(asc(qqChartEntries.page), asc(qqChartEntries.position))
      .limit(RANKINGS_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(qqChartEntries)
      .innerJoin(books, eq(qqChartEntries.bookId, books.id))
      .where(conditions),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return {
    items,
    total,
    totalPages: Math.ceil(total / RANKINGS_PAGE_SIZE),
  };
}

// ============================================================================
// Community rankings queries
// ============================================================================

const COMMUNITY_PAGE_SIZE = PAGINATION_SIZE;
const COMMUNITY_MAX_ITEMS = 1000;

export type CommunityPeriod = "daily" | "weekly" | "monthly" | "all-time";

export function getCutoffDate(period: CommunityPeriod): string | null {
  if (period === "all-time") return null;
  const d = new Date();
  if (period === "daily") d.setDate(d.getDate() - 1);
  else if (period === "weekly") d.setDate(d.getDate() - 7);
  else if (period === "monthly") d.setDate(d.getDate() - 30);
  return d.toISOString();
}

// Tiebreaker: community reviews first, qidian comments as fallback
const communityTiebreakers = [
  desc(sql`CASE WHEN COALESCE(${bookStats.reviewCount}, 0) > 0 THEN ${bookStats.reviewCount} ELSE COALESCE(${bookStats.commentCount}, 0) END`),
  desc(sql`CASE WHEN COALESCE(${bookStats.ratingCount}, 0) > 0 THEN ${bookStats.ratingPositive}::float / NULLIF(${bookStats.ratingCount}, 0) ELSE 0 END`),
  desc(sql`COALESCE(${bookStats.bookmarkCount}, 0)`),
];

export async function getCommunityRankings({ period, page, genreId }: { period: CommunityPeriod; page: number; genreId?: number }) {
  const offset = (page - 1) * COMMUNITY_PAGE_SIZE;
  const cutoff = getCutoffDate(period);

  const baseConditions: SQL[] = [eq(genres.blacklisted, false)];
  if (genreId) baseConditions.push(eq(books.genreId, genreId));
  const whereClause = and(...baseConditions)!;

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
    wordCount: books.wordCount,
    qqScore: books.qqScore,
  };

  if (!cutoff) {
    // All-time: use materialized book_stats.reader_count
    const [items, countResult] = await Promise.all([
      db
        .select({
          ...selectFields,
          readerCount: sql<number>`COALESCE(${bookStats.readerCount}, 0)`.as("active_reader_count"),
        })
        .from(bookStats)
        .innerJoin(books, eq(bookStats.bookId, books.id))
        .leftJoin(genres, eq(books.genreId, genres.id))
        .where(whereClause)
        .orderBy(
          desc(sql`COALESCE(${bookStats.readerCount}, 0)`),
          ...communityTiebreakers,
        )
        .limit(COMMUNITY_PAGE_SIZE)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(bookStats)
        .innerJoin(books, eq(bookStats.bookId, books.id))
        .leftJoin(genres, eq(books.genreId, genres.id))
        .where(whereClause),
    ]);

    const total = Math.min(Number(countResult[0]?.count ?? 0), COMMUNITY_MAX_ITEMS);
    return {
      items: items.map((item, i) => ({ ...item, position: offset + i + 1 })),
      total,
      totalPages: Math.ceil(total / COMMUNITY_PAGE_SIZE),
    };
  }

  // Time-based: LEFT JOIN reader counts so all books appear (0 readers if none in window)
  const readerCounts = db
    .select({
      bookId: readingProgressHistories.bookId,
      readerCount: sql<number>`count(distinct ${readingProgressHistories.userId})`.as("active_reader_count"),
    })
    .from(readingProgressHistories)
    .where(sql`${readingProgressHistories.recordedAt} >= ${cutoff}`)
    .groupBy(readingProgressHistories.bookId)
    .as("rc");

  const [items, countResult] = await Promise.all([
    db
      .select({
        ...selectFields,
        readerCount: sql<number>`COALESCE("rc"."active_reader_count", 0)`.as("period_reader_count"),
      })
      .from(bookStats)
      .innerJoin(books, eq(bookStats.bookId, books.id))
      .leftJoin(genres, eq(books.genreId, genres.id))
      .leftJoin(readerCounts, eq(books.id, readerCounts.bookId))
      .where(whereClause)
      .orderBy(
        desc(sql`COALESCE("rc"."active_reader_count", 0)`),
        ...communityTiebreakers,
      )
      .limit(COMMUNITY_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookStats)
      .innerJoin(books, eq(bookStats.bookId, books.id))
      .leftJoin(genres, eq(books.genreId, genres.id))
      .where(whereClause),
  ]);

  const total = Math.min(Number(countResult[0]?.count ?? 0), COMMUNITY_MAX_ITEMS);
  return {
    items: items.map((item, i) => ({ ...item, position: offset + i + 1 })),
    total,
    totalPages: Math.ceil(total / COMMUNITY_PAGE_SIZE),
  };
}

export async function getAvailableCycles() {
  const rows = await db
    .selectDistinct({ cycle: qqChartEntries.cycle })
    .from(qqChartEntries)
    .orderBy(desc(qqChartEntries.cycle));

  return rows.map((r) => r.cycle);
}

export async function getQidianRankingGenres(gender: string, rankType: string, cycle: string) {
  return db
    .select({
      id: genres.id,
      name: genres.name,
      nameTranslated: genres.nameTranslated,
    })
    .from(genres)
    .innerJoin(books, eq(books.genreId, genres.id))
    .innerJoin(qqChartEntries, eq(qqChartEntries.bookId, books.id))
    .where(and(
      eq(genres.blacklisted, false),
      eq(qqChartEntries.gender, gender),
      eq(qqChartEntries.rankType, rankType),
      eq(qqChartEntries.cycle, cycle),
    ))
    .groupBy(genres.id, genres.name, genres.nameTranslated)
    .orderBy(asc(sql`COALESCE(${genres.nameTranslated}, ${genres.name})`));
}
