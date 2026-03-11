import { db } from "@/db";
import { books, genres, chapters, qqChartEntries, qqUsers, bookComments, bookStats, bookReviews, bookRatings, bookmarks, bookLists, bookListItems, bookListFollows, bookListItemLikes, readingProgresses, readingProgressHistories, reviewLikes, reviewReplies, users, notifications, qidianBooklists, qidianBooklistItems, qidianBooklistFollows, tags, bookTags, booklistTags } from "@/db/schema";
import { count } from "drizzle-orm";
import { eq, and, sql, asc, desc, isNotNull, aliasedTable, inArray, type SQL } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { PAGE_SIZE, REVIEWS_PAGE_SIZE, PAGINATION_SIZE, LIBRARY_PAGE_SIZE, type LibrarySort, type PopularityPeriod } from "./constants";
import Redis from "ioredis";
import { env } from "./env";

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

const BOOKLISTS_PAGE_SIZE_FIRST = PAGINATION_SIZE;   // 49: 3 podium + 46 grid (even)
const BOOKLISTS_PAGE_SIZE_REST = PAGINATION_SIZE - 1; // 48: even for 2-col grid

export type QidianBooklistSort = "popular" | "recent" | "largest";

export async function getQidianBooklists({ page, sort }: { page: number; sort: QidianBooklistSort }) {
  const limit = page === 1 ? BOOKLISTS_PAGE_SIZE_FIRST : BOOKLISTS_PAGE_SIZE_REST;
  const offset = page === 1 ? 0 : BOOKLISTS_PAGE_SIZE_FIRST + (page - 2) * BOOKLISTS_PAGE_SIZE_REST;
  const baseConditions = isNotNull(qidianBooklists.title);

  const matchedCounts = db
    .select({
      booklistId: qidianBooklistItems.booklistId,
      matchedBookCount: sql<number>`count(*) filter (where ${qidianBooklistItems.bookId} is not null)`.as("matched_book_count"),
    })
    .from(qidianBooklistItems)
    .groupBy(qidianBooklistItems.booklistId)
    .as("matched_counts");

  const orderByMap: Record<QidianBooklistSort, SQL[]> = {
    popular: [
      desc(sql`COALESCE(${qidianBooklists.followerCount}, 0)`),
      desc(sql`COALESCE(${matchedCounts.matchedBookCount}, 0)`),
      desc(sql`COALESCE(${qidianBooklists.bookCount}, 0)`),
      desc(sql`COALESCE(${qidianBooklists.lastUpdatedAt}, ${qidianBooklists.updatedAt})`),
      desc(qidianBooklists.id),
    ],
    recent: [
      desc(sql`COALESCE(${qidianBooklists.lastUpdatedAt}, ${qidianBooklists.updatedAt})`),
      desc(sql`COALESCE(${qidianBooklists.followerCount}, 0)`),
      desc(qidianBooklists.id),
    ],
    largest: [
      desc(sql`COALESCE(${qidianBooklists.bookCount}, 0)`),
      desc(sql`COALESCE(${matchedCounts.matchedBookCount}, 0)`),
      desc(sql`COALESCE(${qidianBooklists.followerCount}, 0)`),
      desc(qidianBooklists.id),
    ],
  };

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: qidianBooklists.id,
        qidiantuId: qidianBooklists.qidiantuId,
        title: qidianBooklists.title,
        titleTranslated: qidianBooklists.titleTranslated,
        description: qidianBooklists.description,
        descriptionTranslated: qidianBooklists.descriptionTranslated,
        tags: qidianBooklists.tags,
        tagsTranslated: qidianBooklists.tagsTranslated,
        followerCount: qidianBooklists.followerCount,
        bookCount: qidianBooklists.bookCount,
        matchedBookCount: sql<number>`COALESCE(${matchedCounts.matchedBookCount}, 0)`.as("matched_book_count"),
        lastUpdatedAt: qidianBooklists.lastUpdatedAt,
        updatedAt: qidianBooklists.updatedAt,
      })
      .from(qidianBooklists)
      .leftJoin(matchedCounts, eq(qidianBooklists.id, matchedCounts.booklistId))
      .where(baseConditions)
      .orderBy(...orderByMap[sort])
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(qidianBooklists)
      .where(baseConditions),
  ]);

  const booklistIds = items.map((item) => item.id);

  const previews = booklistIds.length > 0
    ? await db
      .select({
        booklistId: qidianBooklistItems.booklistId,
        position: qidianBooklistItems.position,
        bookId: books.id,
        title: books.title,
        titleTranslated: books.titleTranslated,
        imageUrl: books.imageUrl,
      })
      .from(qidianBooklistItems)
      .innerJoin(books, eq(qidianBooklistItems.bookId, books.id))
      .where(inArray(qidianBooklistItems.booklistId, booklistIds))
      .orderBy(
        asc(qidianBooklistItems.booklistId),
        asc(sql`COALESCE(${qidianBooklistItems.position}, 2147483647)`),
        asc(qidianBooklistItems.id),
      )
    : [];

  const previewMap = new Map<number, typeof previews>();
  for (const preview of previews) {
    const current = previewMap.get(preview.booklistId) ?? [];
    if (current.length < 4) current.push(preview);
    previewMap.set(preview.booklistId, current);
  }

  const total = Number(countResult[0]?.count ?? 0);

  return {
    items: items.map((item, index) => ({
      ...item,
      position: offset + index + 1,
      previews: previewMap.get(item.id) ?? [],
    })),
    total,
    totalPages: total <= BOOKLISTS_PAGE_SIZE_FIRST ? 1 : 1 + Math.ceil((total - BOOKLISTS_PAGE_SIZE_FIRST) / BOOKLISTS_PAGE_SIZE_REST),
  };
}

const BOOKLIST_DETAIL_PAGE_SIZE = 20;

export async function getQidianBooklistDetail(booklistId: number, page: number = 1, userId?: number) {
  const offset = (page - 1) * BOOKLIST_DETAIL_PAGE_SIZE;

  const booklist = await db
    .select({
      id: qidianBooklists.id,
      qidiantuId: qidianBooklists.qidiantuId,
      title: qidianBooklists.title,
      titleTranslated: qidianBooklists.titleTranslated,
      description: qidianBooklists.description,
      descriptionTranslated: qidianBooklists.descriptionTranslated,
      tags: qidianBooklists.tags,
      tagsTranslated: qidianBooklists.tagsTranslated,
      followerCount: qidianBooklists.followerCount,
      daosearchFollowerCount: qidianBooklists.daosearchFollowerCount,
      bookCount: qidianBooklists.bookCount,
      lastUpdatedAt: qidianBooklists.lastUpdatedAt,
      updatedAt: qidianBooklists.updatedAt,
    })
    .from(qidianBooklists)
    .where(eq(qidianBooklists.id, booklistId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!booklist) return null;

  let userHasFollowed = false;
  if (userId) {
    const [follow] = await db
      .select({ id: qidianBooklistFollows.id })
      .from(qidianBooklistFollows)
      .where(and(eq(qidianBooklistFollows.booklistId, booklistId), eq(qidianBooklistFollows.userId, userId)))
      .limit(1);
    userHasFollowed = !!follow;
  }

  const genre = aliasedTable(genres, "genre");

  const [items, countResult] = await Promise.all([
    db
      .select({
        itemId: qidianBooklistItems.id,
        position: qidianBooklistItems.position,
        curatorComment: qidianBooklistItems.curatorComment,
        curatorCommentTranslated: qidianBooklistItems.curatorCommentTranslated,
        heartCount: qidianBooklistItems.heartCount,
        bookId: books.id,
        title: books.title,
        titleTranslated: books.titleTranslated,
        author: books.author,
        authorTranslated: books.authorTranslated,
        imageUrl: books.imageUrl,
        synopsisTranslated: books.synopsisTranslated,
        wordCount: books.wordCount,
        qqScore: books.qqScore,
        genreName: genre.name,
        genreNameTranslated: genre.nameTranslated,
        commentCount: bookStats.commentCount,
        reviewCount: bookStats.reviewCount,
        ratingCount: bookStats.ratingCount,
        ratingPositive: bookStats.ratingPositive,
        ratingNeutral: bookStats.ratingNeutral,
        ratingNegative: bookStats.ratingNegative,
      })
      .from(qidianBooklistItems)
      .innerJoin(books, eq(qidianBooklistItems.bookId, books.id))
      .leftJoin(genre, eq(books.genreId, genre.id))
      .leftJoin(bookStats, eq(books.id, bookStats.bookId))
      .where(eq(qidianBooklistItems.booklistId, booklistId))
      .orderBy(
        asc(sql`COALESCE(${qidianBooklistItems.position}, 2147483647)`),
        asc(qidianBooklistItems.id),
      )
      .limit(BOOKLIST_DETAIL_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(qidianBooklistItems)
      .innerJoin(books, eq(qidianBooklistItems.bookId, books.id))
      .where(eq(qidianBooklistItems.booklistId, booklistId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return {
    booklist,
    items,
    total,
    totalPages: Math.ceil(total / BOOKLIST_DETAIL_PAGE_SIZE),
    userHasFollowed,
  };
}

// ============================================================================
// Community rankings queries
// ============================================================================

const COMMUNITY_PAGE_SIZE = PAGINATION_SIZE;
const COMMUNITY_MAX_ITEMS = 1000;

export type CommunityPeriod = "daily" | "weekly" | "monthly" | "all-time";

function getCutoffDate(period: CommunityPeriod): string | null {
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

// ============================================================================
// Stats queries
// ============================================================================

export const getDbStats = unstable_cache(
  async () => {
    // Use COUNT FILTER to collapse many queries into single table scans
    const blacklistSubquery = sql`SELECT ${genres.id} FROM ${genres} WHERE ${genres.blacklisted} = true`;
    const nb = sql`(${books.genreId} IS NULL OR ${books.genreId} NOT IN (${blacklistSubquery}))`;

    const [bookRow, chapterRow, commentRow, qqUserRow, qidianRow, blacklistRow, communityRow] = await Promise.all([
      // Books: 1 query instead of 3
      db.select({
        total: sql<number>`count(*) filter (where ${nb})`,
        scraped: sql<number>`count(*) filter (where ${books.title} is not null and ${nb})`,
        translated: sql<number>`count(*) filter (where ${books.titleTranslated} is not null and ${nb})`,
      }).from(books),

      // Chapters: 1 query instead of 2
      db.select({
        total: sql<number>`count(*)`,
        translated: sql<number>`count(*) filter (where ${chapters.titleTranslated} is not null)`,
      }).from(chapters),

      // Comments: 1 query instead of 2
      db.select({
        total: sql<number>`count(*)`,
        translated: sql<number>`count(*) filter (where ${bookComments.contentTranslated} is not null)`,
      }).from(bookComments),

      // QQ Users: 1 query instead of 2
      db.select({
        total: sql<number>`count(*)`,
        translated: sql<number>`count(*) filter (where ${qqUsers.nicknameTranslated} is not null)`,
      }).from(qqUsers),

      // Qidian data: 1 query for rankings + booklists + booklist items
      db.execute<{ rankings: number; bl_total: number; bl_translated: number; bl_items: number; qq_ratings: number }>(sql`
        SELECT
          (SELECT count(*) FROM ${qqChartEntries}) AS rankings,
          (SELECT count(*) FROM ${qidianBooklists}) AS bl_total,
          (SELECT count(*) FROM ${qidianBooklists} WHERE ${qidianBooklists.titleTranslated} IS NOT NULL) AS bl_translated,
          (SELECT count(*) FROM ${qidianBooklistItems}) AS bl_items,
          (SELECT COALESCE(sum(${books.qqScoreCount})::bigint, 0) FROM ${books} WHERE ${books.qqScoreCount} IS NOT NULL AND (${books.genreId} IS NULL OR ${books.genreId} NOT IN (SELECT ${genres.id} FROM ${genres} WHERE ${genres.blacklisted} = true))) AS qq_ratings
      `),

      // Blacklisted: 1 query
      db.execute<{ bl_genres: number; bl_books: number }>(sql`
        SELECT
          (SELECT count(*) FROM ${genres} WHERE ${genres.blacklisted} = true) AS bl_genres,
          (SELECT count(*) FROM ${books} INNER JOIN ${genres} ON ${books.genreId} = ${genres.id} WHERE ${genres.blacklisted} = true) AS bl_books
      `),

      // Community: 1 query for all community stats
      db.execute<{
        users_total: number; users_google: number; users_discord: number;
        reviews: number; replies: number;
        ratings_good: number; ratings_neutral: number; ratings_bad: number;
        bm_total: number; bm_reading: number; bm_completed: number; bm_plan: number; bm_dropped: number;
        lists: number; list_items: number; list_follows: number;
        tags_total: number; tag_votes: number;
      }>(sql`
        SELECT
          (SELECT count(*) FROM ${users}) AS users_total,
          (SELECT count(*) FROM ${users} WHERE ${users.provider} = 'google') AS users_google,
          (SELECT count(*) FROM ${users} WHERE ${users.provider} = 'discord') AS users_discord,
          (SELECT count(*) FROM ${bookReviews}) AS reviews,
          (SELECT count(*) FROM ${reviewReplies}) AS replies,
          (SELECT count(*) FROM ${bookRatings} WHERE ${bookRatings.rating} = 1) AS ratings_good,
          (SELECT count(*) FROM ${bookRatings} WHERE ${bookRatings.rating} = 0) AS ratings_neutral,
          (SELECT count(*) FROM ${bookRatings} WHERE ${bookRatings.rating} = -1) AS ratings_bad,
          (SELECT count(*) FROM ${bookmarks}) AS bm_total,
          (SELECT count(*) FROM ${bookmarks} WHERE ${bookmarks.status} = 'reading') AS bm_reading,
          (SELECT count(*) FROM ${bookmarks} WHERE ${bookmarks.status} = 'completed') AS bm_completed,
          (SELECT count(*) FROM ${bookmarks} WHERE ${bookmarks.status} = 'plan_to_read') AS bm_plan,
          (SELECT count(*) FROM ${bookmarks} WHERE ${bookmarks.status} = 'dropped') AS bm_dropped,
          (SELECT count(*) FROM ${bookLists}) AS lists,
          (SELECT count(*) FROM ${bookListItems}) AS list_items,
          (SELECT count(*) FROM ${bookListFollows}) AS list_follows,
          (SELECT count(*) FROM ${tags}) AS tags_total,
          (SELECT count(*) FROM ${bookTags}) AS tag_votes
      `),
    ]);

    const b = bookRow[0];
    const ch = chapterRow[0];
    const co = commentRow[0];
    const qu = qqUserRow[0];
    const qi = qidianRow[0];
    const bl = blacklistRow[0];
    const cm = communityRow[0];

    return {
      books: { total: Number(b.total), scraped: Number(b.scraped), translated: Number(b.translated) },
      chapters: { total: Number(ch.total), translated: Number(ch.translated) },
      comments: { total: Number(co.total), translated: Number(co.translated) },
      qqUsers: { total: Number(qu.total), translated: Number(qu.translated) },
      rankings: Number(qi.rankings),
      booklists: { total: Number(qi.bl_total), translated: Number(qi.bl_translated), items: Number(qi.bl_items) },
      qqRatings: Number(qi.qq_ratings),
      blacklisted: { genres: Number(bl.bl_genres), books: Number(bl.bl_books) },
      community: {
        users: Number(cm.users_total),
        usersGoogle: Number(cm.users_google),
        usersDiscord: Number(cm.users_discord),
        reviews: Number(cm.reviews),
        reviewReplies: Number(cm.replies),
        ratingsGood: Number(cm.ratings_good),
        ratingsNeutral: Number(cm.ratings_neutral),
        ratingsBad: Number(cm.ratings_bad),
        bookmarks: Number(cm.bm_total),
        bookmarksReading: Number(cm.bm_reading),
        bookmarksCompleted: Number(cm.bm_completed),
        bookmarksPlanToRead: Number(cm.bm_plan),
        bookmarksDropped: Number(cm.bm_dropped),
        lists: Number(cm.lists),
        listItems: Number(cm.list_items),
        listFollows: Number(cm.list_follows),
        tags: Number(cm.tags_total),
        tagVotes: Number(cm.tag_votes),
      },
    };
  },
  ["db-stats"],
  { revalidate: 1800 },
);

const QUEUE_NAMES = [
  "scraper-charts",
  "scraper-books",
  "scraper-booklists",
  "scraper-comments",
  "translation-books",
  "translation-booklists",
  "translation-comments",
  "translation-nicknames",
  "translation-chapters",
  "maintenance",
  "general",
] as const;

export interface QueueStat {
  name: string;
  pending: number;
  started: number;
  failed: number;
}

export async function getQueueStats(): Promise<QueueStat[]> {
  const redis = new Redis(env.redis.url, { lazyConnect: true, connectTimeout: 5000 });

  try {
    await redis.connect();
    const pipeline = redis.pipeline();

    for (const name of QUEUE_NAMES) {
      pipeline.llen(`rq:queue:${name}`);
      pipeline.zcard(`rq:wip:${name}`);
      pipeline.zcard(`rq:failed:${name}`);
    }

    const results = await pipeline.exec();
    if (!results) return [];

    const stats: QueueStat[] = [];
    for (let i = 0; i < QUEUE_NAMES.length; i++) {
      const base = i * 3;
      stats.push({
        name: QUEUE_NAMES[i],
        pending: Number(results[base]?.[1] ?? 0),
        started: Number(results[base + 1]?.[1] ?? 0),
        failed: Number(results[base + 2]?.[1] ?? 0),
      });
    }

    return stats;
  } catch {
    return [];
  } finally {
    redis.disconnect();
  }
}

// ============================================================================
// Book detail queries
// ============================================================================

export const getBook = (id: number) =>
  unstable_cache(
    async () => {
      const subgenres = aliasedTable(genres, "subgenres");

      const rows = await db
        .select({
          id: books.id,
          url: books.url,
          imageUrl: books.imageUrl,
          title: books.title,
          titleTranslated: books.titleTranslated,
          author: books.author,
          authorTranslated: books.authorTranslated,
          synopsis: books.synopsis,
          synopsisTranslated: books.synopsisTranslated,
          updateTime: books.updateTime,
          lastScrapedAt: books.lastScrapedAt,
          lastCommentsScrapedAt: books.lastCommentsScrapedAt,
          genreId: books.genreId,
          genreName: genres.name,
          genreNameTranslated: genres.nameTranslated,
          subgenreId: books.subgenreId,
          subgenreName: subgenres.name,
          subgenreNameTranslated: subgenres.nameTranslated,
          wordCount: books.wordCount,
          status: books.status,
          sexAttr: books.sexAttr,
          qqScore: books.qqScore,
          qqScoreCount: books.qqScoreCount,
          qqFavoriteCount: books.qqFavoriteCount,
          qqFanCount: books.qqFanCount,
          recommendationQqIds: books.recommendationQqIds,
        })
        .from(books)
        .leftJoin(genres, eq(books.genreId, genres.id))
        .leftJoin(subgenres, eq(books.subgenreId, subgenres.id))
        .where(eq(books.id, id))
        .limit(1);

      return rows[0] ?? null;
    },
    [`book-${id}`],
    { revalidate: 60 },
  )();

export const getBookStats = (bookId: number) =>
  unstable_cache(
    async () => {
      const rows = await db
        .select()
        .from(bookStats)
        .where(eq(bookStats.bookId, bookId))
        .limit(1);

      return rows[0] ?? null;
    },
    [`book-stats-${bookId}`],
    { revalidate: 60 },
  )();

export async function getBookComments(bookId: number, page: number = 1) {
  const offset = (page - 1) * REVIEWS_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookComments.id,
        title: bookComments.title,
        titleTranslated: bookComments.titleTranslated,
        content: bookComments.content,
        contentTranslated: bookComments.contentTranslated,
        images: bookComments.images,
        agreeCount: bookComments.agreeCount,
        replyCount: bookComments.replyCount,
        commentCreatedAt: bookComments.commentCreatedAt,
        qqUserNickname: qqUsers.nickname,
        qqUserNicknameTranslated: qqUsers.nicknameTranslated,
        qqUserIconUrl: qqUsers.iconUrl,
      })
      .from(bookComments)
      .innerJoin(qqUsers, eq(bookComments.qqUserId, qqUsers.id))
      .where(eq(bookComments.bookId, bookId))
      .orderBy(desc(bookComments.agreeCount))
      .limit(REVIEWS_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookComments)
      .where(eq(bookComments.bookId, bookId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  // Strip Qidian emot tags like [emot=default,80/]
  const emot = /\[emot=[^\]]*\/?\]/g;
  const cleanedItems = items.map((item) => ({
    ...item,
    content: item.content?.replace(emot, "").trim() ?? null,
    contentTranslated: item.contentTranslated?.replace(emot, "").trim() ?? null,
  }));

  return {
    items: cleanedItems,
    total,
    totalPages: Math.ceil(total / REVIEWS_PAGE_SIZE),
  };
}

const CHAPTERS_PAGE_SIZE = PAGINATION_SIZE;

export async function getBookChapters(bookId: number, page: number = 1) {
  const offset = (page - 1) * CHAPTERS_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: chapters.id,
        sequenceNumber: chapters.sequenceNumber,
        title: chapters.title,
        titleTranslated: chapters.titleTranslated,
        url: chapters.url,
      })
      .from(chapters)
      .where(eq(chapters.bookId, bookId))
      .orderBy(asc(chapters.sequenceNumber))
      .limit(CHAPTERS_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(chapters)
      .where(eq(chapters.bookId, bookId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return {
    items,
    total,
    totalPages: Math.ceil(total / CHAPTERS_PAGE_SIZE),
  };
}

export async function getBookRankings(bookId: number) {
  const rows = await db
    .select({
      gender: qqChartEntries.gender,
      rankType: qqChartEntries.rankType,
      cycle: qqChartEntries.cycle,
      position: sql<number>`min(${qqChartEntries.position})`,
    })
    .from(qqChartEntries)
    .where(eq(qqChartEntries.bookId, bookId))
    .groupBy(qqChartEntries.gender, qqChartEntries.rankType, qqChartEntries.cycle);

  return rows
    .filter((r) => r.position <= 20)
    .sort((a, b) => a.position - b.position);
}

const COMMUNITY_BADGE_LIMIT = 20;

export async function getBookCommunityRankings(bookId: number) {
  const results: { position: number; period: string }[] = [];

  // All-time: count books with more readers
  const bookRow = await db
    .select({ readerCount: bookStats.readerCount })
    .from(bookStats)
    .where(eq(bookStats.bookId, bookId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!bookRow || (bookRow.readerCount ?? 0) === 0) return results;

  const [allTimeResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookStats)
    .innerJoin(books, eq(bookStats.bookId, books.id))
    .leftJoin(genres, eq(books.genreId, genres.id))
    .where(
      and(
        eq(genres.blacklisted, false),
        sql`COALESCE(${bookStats.readerCount}, 0) > ${bookRow.readerCount}`,
      ),
    );

  const allTimePos = Number(allTimeResult?.count ?? 0) + 1;
  if (allTimePos <= COMMUNITY_BADGE_LIMIT) {
    results.push({ position: allTimePos, period: "all-time" });
  }

  // Weekly: count books with more readers in last 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const weeklyReaders = await db
    .select({ count: sql<number>`count(distinct ${readingProgressHistories.userId})` })
    .from(readingProgressHistories)
    .where(
      and(
        eq(readingProgressHistories.bookId, bookId),
        sql`${readingProgressHistories.recordedAt} >= ${cutoff.toISOString()}`,
      ),
    )
    .then((rows) => Number(rows[0]?.count ?? 0));

  if (weeklyReaders > 0) {
    const readerCounts = db
      .select({
        bookId: readingProgressHistories.bookId,
        readerCount: sql<number>`count(distinct ${readingProgressHistories.userId})`.as("rc"),
      })
      .from(readingProgressHistories)
      .where(sql`${readingProgressHistories.recordedAt} >= ${cutoff.toISOString()}`)
      .groupBy(readingProgressHistories.bookId)
      .having(sql`count(distinct ${readingProgressHistories.userId}) > ${weeklyReaders}`)
      .as("wrc");

    const [weeklyResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(readerCounts);

    const weeklyPos = Number(weeklyResult?.count ?? 0) + 1;
    if (weeklyPos <= COMMUNITY_BADGE_LIMIT) {
      results.push({ position: weeklyPos, period: "weekly" });
    }
  }

  return results;
}

const BOOKLIST_ITEMS_PAGE_SIZE = 10;

export async function getBookBooklists(bookId: number, page: number = 1) {
  const offset = (page - 1) * BOOKLIST_ITEMS_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        booklistId: qidianBooklists.id,
        title: qidianBooklists.title,
        titleTranslated: qidianBooklists.titleTranslated,
        followerCount: qidianBooklists.followerCount,
        bookCount: qidianBooklists.bookCount,
        curatorComment: qidianBooklistItems.curatorComment,
        curatorCommentTranslated: qidianBooklistItems.curatorCommentTranslated,
        heartCount: qidianBooklistItems.heartCount,
      })
      .from(qidianBooklistItems)
      .innerJoin(qidianBooklists, eq(qidianBooklistItems.booklistId, qidianBooklists.id))
      .where(eq(qidianBooklistItems.bookId, bookId))
      .orderBy(desc(sql`COALESCE(${qidianBooklists.followerCount}, 0)`))
      .limit(BOOKLIST_ITEMS_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(qidianBooklistItems)
      .innerJoin(qidianBooklists, eq(qidianBooklistItems.booklistId, qidianBooklists.id))
      .where(eq(qidianBooklistItems.bookId, bookId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return { items, total };
}

export async function getBookReviews(bookId: number, page: number = 1, currentUserId?: number | null) {
  const offset = (page - 1) * REVIEWS_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookReviews.id,
        userId: bookReviews.userId,
        reviewText: bookReviews.reviewText,
        createdAt: bookReviews.createdAt,
        userDisplayName: users.publicUsername,
        userAvatarUrl: users.publicAvatarUrl,
        rating: bookRatings.rating,
        likeCount: sql<number>`(SELECT count(*) FROM review_likes WHERE review_id = ${bookReviews.id})`,
        replyCount: sql<number>`(SELECT count(*) FROM review_replies WHERE review_id = ${bookReviews.id})`,
        userHasLiked: currentUserId
          ? sql<boolean>`EXISTS (SELECT 1 FROM review_likes WHERE review_id = ${bookReviews.id} AND user_id = ${currentUserId})`
          : sql<boolean>`false`,
      })
      .from(bookReviews)
      .innerJoin(users, eq(bookReviews.userId, users.id))
      .leftJoin(
        bookRatings,
        and(
          eq(bookRatings.userId, bookReviews.userId),
          eq(bookRatings.bookId, bookReviews.bookId),
        ),
      )
      .where(eq(bookReviews.bookId, bookId))
      .orderBy(desc(bookReviews.createdAt))
      .limit(REVIEWS_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookReviews)
      .where(eq(bookReviews.bookId, bookId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return {
    items,
    total,
    totalPages: Math.ceil(total / REVIEWS_PAGE_SIZE),
  };
}

// ============================================================================
// Latest Qidian comments (global feed)
// ============================================================================

const FEED_PAGE_SIZE = PAGINATION_SIZE;

type RawQueryRow = Record<string, unknown>;

function isRawQueryRow(value: unknown): value is RawQueryRow {
  return typeof value === "object" && value !== null;
}

function getRawQueryRows(result: unknown): RawQueryRow[] {
  if (Array.isArray(result)) return result.filter(isRawQueryRow);
  if (isRawQueryRow(result) && Array.isArray(result.rows)) {
    return result.rows.filter(isRawQueryRow);
  }
  return [];
}

function getNumberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function getNullableNumberValue(value: unknown): number | null {
  return value == null ? null : getNumberValue(value);
}

function getStringValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function getNullableStringValue(value: unknown): string | null {
  return value == null ? null : getStringValue(value);
}

// Cap navigable pages to avoid slow high-OFFSET queries on millions of rows
const MAX_FEED_PAGES = 100;

export async function getLatestQidianComments(page: number = 1) {
  const clampedPage = Math.min(page, MAX_FEED_PAGES);
  const offset = (clampedPage - 1) * FEED_PAGE_SIZE;

  // Use estimated count from pg_class to avoid slow count(*) on large table
  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookComments.id,
        title: bookComments.title,
        titleTranslated: bookComments.titleTranslated,
        content: bookComments.content,
        contentTranslated: bookComments.contentTranslated,
        images: bookComments.images,
        agreeCount: bookComments.agreeCount,
        replyCount: bookComments.replyCount,
        commentCreatedAt: bookComments.commentCreatedAt,
        qqUserNickname: qqUsers.nickname,
        qqUserNicknameTranslated: qqUsers.nicknameTranslated,
        qqUserIconUrl: qqUsers.iconUrl,
        bookId: books.id,
        bookTitle: books.titleTranslated,
        bookTitleOriginal: books.title,
        bookImageUrl: books.imageUrl,
      })
      .from(bookComments)
      .innerJoin(qqUsers, eq(bookComments.qqUserId, qqUsers.id))
      .innerJoin(books, eq(bookComments.bookId, books.id))
      .orderBy(desc(bookComments.commentCreatedAt))
      .limit(FEED_PAGE_SIZE)
      .offset(offset),
    db.execute(sql`SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'book_comments'`),
  ]);

  const total = Math.max(getNumberValue(getRawQueryRows(countResult)[0]?.count), items.length);
  const totalPages = Math.min(Math.ceil(total / FEED_PAGE_SIZE), MAX_FEED_PAGES);

  return {
    items,
    total,
    totalPages,
  };
}

// ============================================================================
// DaoSearch activity feed
// ============================================================================

const DS_FEED_PAGE_SIZE = 50;

export interface DaoSearchFeedItem {
  activityType: string;
  activityAt: string;
  ratingValue: number | null;
  reviewText: string | null;
  replyText: string | null;
  chapterTitle: string | null;
  chapterNumber: number | null;
  bookId: number | null;
  bookTitle: string | null;
  bookTitleOriginal: string | null;
  bookImageUrl: string | null;
  listId: number | null;
  listName: string | null;
  listType: string | null;
  username: string;
  avatarUrl: string | null;
}

export async function getDaoSearchFeed(page: number = 1) {
  const clampedPage = Math.min(page, MAX_FEED_PAGES);
  const offset = (clampedPage - 1) * DS_FEED_PAGE_SIZE;

  const [rows, countResult] = await Promise.all([
    db.execute(sql`
      (
        SELECT 'rating'::text as activity_type,
          br.created_at as activity_at,
          br.rating as rating_value,
          NULL::text as review_text,
          NULL::text as reply_text,
          NULL::text as chapter_title,
          NULL::int as chapter_number,
          b.id as book_id,
          b.title_translated as book_title,
          b.title as book_title_original,
          b.image_url as book_image_url,
          NULL::int as list_id,
          NULL::text as list_name,
          NULL::text as list_type,
          u.public_username as username,
          u.public_avatar_url as avatar_url
        FROM book_ratings br
        JOIN books b ON br.book_id = b.id
        JOIN users u ON br.user_id = u.id
      )
      UNION ALL
      (
        SELECT 'review'::text,
          brev.created_at,
          NULL::int,
          brev.review_text,
          NULL::text,
          NULL::text,
          NULL::int,
          b.id,
          b.title_translated,
          b.title,
          b.image_url,
          NULL::int,
          NULL::text,
          NULL::text,
          u.public_username,
          u.public_avatar_url
        FROM book_reviews brev
        JOIN books b ON brev.book_id = b.id
        JOIN users u ON brev.user_id = u.id
      )
      UNION ALL
      (
        SELECT 'reply'::text,
          rr.created_at,
          NULL::int,
          NULL::text,
          rr.reply_text,
          NULL::text,
          NULL::int,
          b.id,
          b.title_translated,
          b.title,
          b.image_url,
          NULL::int,
          NULL::text,
          NULL::text,
          u.public_username,
          u.public_avatar_url
        FROM review_replies rr
        JOIN book_reviews brev ON rr.review_id = brev.id
        JOIN books b ON brev.book_id = b.id
        JOIN users u ON rr.user_id = u.id
      )
      UNION ALL
      (
        SELECT 'bookmark'::text,
          bm.created_at,
          NULL::int,
          NULL::text,
          NULL::text,
          NULL::text,
          NULL::int,
          b.id,
          b.title_translated,
          b.title,
          b.image_url,
          NULL::int,
          NULL::text,
          NULL::text,
          u.public_username,
          u.public_avatar_url
        FROM bookmarks bm
        JOIN books b ON bm.book_id = b.id
        JOIN users u ON bm.user_id = u.id
      )
      UNION ALL
      (
        SELECT 'read'::text,
          rp.last_read_at,
          NULL::int,
          NULL::text,
          NULL::text,
          COALESCE(c.title_translated, c.title),
          c.sequence_number,
          b.id,
          b.title_translated,
          b.title,
          b.image_url,
          NULL::int,
          NULL::text,
          NULL::text,
          u.public_username,
          u.public_avatar_url
        FROM reading_progresses rp
        JOIN books b ON rp.book_id = b.id
        JOIN users u ON rp.user_id = u.id
        LEFT JOIN chapters c ON rp.chapter_id = c.id
      )
      UNION ALL
      (
        SELECT 'list_follow'::text,
          blf.created_at,
          NULL::int,
          NULL::text,
          NULL::text,
          NULL::text,
          NULL::int,
          NULL::int,
          NULL::text,
          NULL::text,
          fb.image_url,
          bl.id,
          bl.name,
          'community'::text,
          u.public_username,
          u.public_avatar_url
        FROM book_list_follows blf
        JOIN book_lists bl ON blf.list_id = bl.id
        JOIN users u ON blf.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT b.image_url FROM book_list_items bli
          JOIN books b ON bli.book_id = b.id
          WHERE bli.list_id = bl.id AND b.image_url IS NOT NULL
          ORDER BY bli.added_at ASC LIMIT 1
        ) fb ON true
        WHERE bl.is_public = 1
      )
      UNION ALL
      (
        SELECT 'list_follow'::text,
          qbf.created_at,
          NULL::int,
          NULL::text,
          NULL::text,
          NULL::text,
          NULL::int,
          NULL::int,
          NULL::text,
          NULL::text,
          fb.image_url,
          qb.id,
          COALESCE(qb.title_translated, qb.title),
          'qidian'::text,
          u.public_username,
          u.public_avatar_url
        FROM qidian_booklist_follows qbf
        JOIN qidian_booklists qb ON qbf.booklist_id = qb.id
        JOIN users u ON qbf.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT b.image_url FROM qidian_booklist_items qbi
          JOIN books b ON qbi.book_id = b.id
          WHERE qbi.booklist_id = qb.id AND b.image_url IS NOT NULL
          ORDER BY qbi.position ASC NULLS LAST, qbi.id ASC LIMIT 1
        ) fb ON true
      )
      ORDER BY activity_at DESC
      LIMIT ${DS_FEED_PAGE_SIZE}
      OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT (
        (SELECT reltuples FROM pg_class WHERE relname = 'book_ratings') +
        (SELECT reltuples FROM pg_class WHERE relname = 'book_reviews') +
        (SELECT reltuples FROM pg_class WHERE relname = 'review_replies') +
        (SELECT reltuples FROM pg_class WHERE relname = 'bookmarks') +
        (SELECT reltuples FROM pg_class WHERE relname = 'reading_progresses') +
        (SELECT reltuples FROM pg_class WHERE relname = 'book_list_follows') +
        (SELECT reltuples FROM pg_class WHERE relname = 'qidian_booklist_follows')
      )::bigint AS count
    `),
  ]);

  const items: DaoSearchFeedItem[] = getRawQueryRows(rows).map((row) => ({
    activityType: getStringValue(row.activity_type),
    activityAt: getStringValue(row.activity_at),
    ratingValue: getNullableNumberValue(row.rating_value),
    reviewText: getNullableStringValue(row.review_text),
    replyText: getNullableStringValue(row.reply_text),
    chapterTitle: getNullableStringValue(row.chapter_title),
    chapterNumber: getNullableNumberValue(row.chapter_number),
    bookId: getNullableNumberValue(row.book_id),
    bookTitle: getNullableStringValue(row.book_title),
    bookTitleOriginal: getNullableStringValue(row.book_title_original),
    bookImageUrl: getNullableStringValue(row.book_image_url),
    listId: getNullableNumberValue(row.list_id),
    listName: getNullableStringValue(row.list_name),
    listType: getNullableStringValue(row.list_type),
    username: getStringValue(row.username),
    avatarUrl: getNullableStringValue(row.avatar_url),
  }));

  const total = Math.max(getNumberValue(getRawQueryRows(countResult)[0]?.count), items.length);

  const totalPages = Math.min(Math.ceil(total / DS_FEED_PAGE_SIZE), MAX_FEED_PAGES);

  return { items, total, totalPages };
}

// ============================================================================
// User account queries
// ============================================================================

const ACCOUNT_PAGE_SIZE = PAGINATION_SIZE;

import type { BookSort } from "./types";

export async function getUserBookmarks(userId: number, page: number = 1, sort: BookSort = "bookmarked", status?: string | null) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const orderByMap = {
    bookmarked: desc(bookmarks.createdAt),
    last_read: desc(sql`COALESCE(${readingProgresses.lastReadAt}, '1970-01-01'::timestamptz)`),
    recently_updated: desc(sql`COALESCE(${books.updateTime}, '1970-01-01'::timestamptz)`),
    unread: desc(sql`COALESCE(${bookStats.chapterCount}, 0) - COALESCE(${chapters.sequenceNumber}, 0)`),
  };

  const whereConditions = [eq(bookmarks.userId, userId)];
  if (status) {
    whereConditions.push(eq(bookmarks.status, status));
  }
  const whereClause = and(...whereConditions);

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookmarks.id,
        createdAt: bookmarks.createdAt,
        status: bookmarks.status,
        bookId: books.id,
        bookTitle: books.titleTranslated,
        bookTitleOriginal: books.title,
        bookAuthor: books.authorTranslated,
        bookAuthorOriginal: books.author,
        bookImageUrl: books.imageUrl,
        genreName: genres.nameTranslated,
        genreNameOriginal: genres.name,
        lastReadAt: readingProgresses.lastReadAt,
        bookUpdateTime: books.updateTime,
        chapterCount: bookStats.chapterCount,
        readChapterNumber: chapters.sequenceNumber,
      })
      .from(bookmarks)
      .innerJoin(books, eq(bookmarks.bookId, books.id))
      .leftJoin(genres, eq(books.genreId, genres.id))
      .leftJoin(readingProgresses, and(eq(readingProgresses.bookId, books.id), eq(readingProgresses.userId, userId)))
      .leftJoin(chapters, eq(readingProgresses.chapterId, chapters.id))
      .leftJoin(bookStats, eq(books.id, bookStats.bookId))
      .where(whereClause)
      .orderBy(orderByMap[sort])
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(whereClause),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return { items, total, totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE) };
}

export async function getUserReadingHistory(userId: number, page: number = 1) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: readingProgresses.id,
        lastReadAt: readingProgresses.lastReadAt,
        bookId: books.id,
        bookTitle: books.titleTranslated,
        bookTitleOriginal: books.title,
        bookAuthor: books.authorTranslated,
        bookAuthorOriginal: books.author,
        bookImageUrl: books.imageUrl,
        chapterTitle: chapters.titleTranslated,
        chapterTitleOriginal: chapters.title,
        chapterNumber: chapters.sequenceNumber,
      })
      .from(readingProgresses)
      .innerJoin(books, eq(readingProgresses.bookId, books.id))
      .leftJoin(chapters, eq(readingProgresses.chapterId, chapters.id))
      .where(eq(readingProgresses.userId, userId))
      .orderBy(desc(readingProgresses.lastReadAt))
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(readingProgresses)
      .where(eq(readingProgresses.userId, userId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return { items, total, totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE) };
}

export async function getUserReviews(userId: number, page: number = 1) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookReviews.id,
        reviewText: bookReviews.reviewText,
        createdAt: bookReviews.createdAt,
        bookId: books.id,
        bookTitle: books.titleTranslated,
        bookTitleOriginal: books.title,
        bookImageUrl: books.imageUrl,
        likeCount: sql<number>`(SELECT count(*) FROM review_likes WHERE review_id = ${bookReviews.id})`,
        replyCount: sql<number>`(SELECT count(*) FROM review_replies WHERE review_id = ${bookReviews.id})`,
      })
      .from(bookReviews)
      .innerJoin(books, eq(bookReviews.bookId, books.id))
      .where(eq(bookReviews.userId, userId))
      .orderBy(desc(bookReviews.createdAt))
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookReviews)
      .where(eq(bookReviews.userId, userId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return { items, total, totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE) };
}

export async function getUserRatings(userId: number, page: number = 1) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookRatings.id,
        rating: bookRatings.rating,
        createdAt: bookRatings.createdAt,
        bookId: books.id,
        bookTitle: books.titleTranslated,
        bookTitleOriginal: books.title,
        bookAuthor: books.authorTranslated,
        bookAuthorOriginal: books.author,
        bookImageUrl: books.imageUrl,
      })
      .from(bookRatings)
      .innerJoin(books, eq(bookRatings.bookId, books.id))
      .where(eq(bookRatings.userId, userId))
      .orderBy(desc(bookRatings.createdAt))
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookRatings)
      .where(eq(bookRatings.userId, userId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return { items, total, totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE) };
}

export async function getUserTags(userId: number, page: number = 1) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  // Fetch book tags and booklist tags in parallel
  const [bookTagItems, booklistTagItems, bookTagCount, booklistTagCount] = await Promise.all([
    db
      .select({
        id: bookTags.id,
        createdAt: bookTags.createdAt,
        tagName: tags.displayName,
        bookId: books.id,
        bookTitle: books.titleTranslated,
        bookTitleOriginal: books.title,
        bookImageUrl: books.imageUrl,
      })
      .from(bookTags)
      .innerJoin(tags, eq(bookTags.tagId, tags.id))
      .innerJoin(books, eq(bookTags.bookId, books.id))
      .where(eq(bookTags.userId, userId))
      .orderBy(desc(bookTags.createdAt)),
    db
      .select({
        id: booklistTags.id,
        createdAt: booklistTags.createdAt,
        tagName: tags.displayName,
        listId: bookLists.id,
        listName: bookLists.name,
      })
      .from(booklistTags)
      .innerJoin(tags, eq(booklistTags.tagId, tags.id))
      .innerJoin(bookLists, eq(booklistTags.listId, bookLists.id))
      .where(eq(booklistTags.userId, userId))
      .orderBy(desc(booklistTags.createdAt)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookTags)
      .where(eq(bookTags.userId, userId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(booklistTags)
      .where(eq(booklistTags.userId, userId)),
  ]);

  // Merge and sort by createdAt desc
  const allItems = [
    ...bookTagItems.map((item) => ({ ...item, type: "book" as const, listId: null as number | null, listName: null as string | null })),
    ...booklistTagItems.map((item) => ({ ...item, type: "booklist" as const, bookId: null as number | null, bookTitle: null as string | null, bookTitleOriginal: null as string | null, bookImageUrl: null as string | null })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = Number(bookTagCount[0]?.count ?? 0) + Number(booklistTagCount[0]?.count ?? 0);
  const paged = allItems.slice(offset, offset + ACCOUNT_PAGE_SIZE);

  return { items: paged, total, totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE) };
}

export async function getUserLists(userId: number, page: number = 1) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookLists.id,
        name: bookLists.name,
        description: bookLists.description,
        isPublic: bookLists.isPublic,
        followerCount: bookLists.followerCount,
        itemCount: count(bookListItems.id),
        coverImageUrl: sql<string | null>`(
          SELECT b.image_url FROM book_list_items bli
          JOIN books b ON b.id = bli.book_id
          WHERE bli.list_id = ${bookLists.id}
          ORDER BY bli.added_at ASC
          LIMIT 1
        )`,
        createdAt: bookLists.createdAt,
        updatedAt: bookLists.updatedAt,
      })
      .from(bookLists)
      .leftJoin(bookListItems, eq(bookListItems.listId, bookLists.id))
      .where(eq(bookLists.userId, userId))
      .groupBy(bookLists.id)
      .orderBy(bookLists.updatedAt)
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: count() })
      .from(bookLists)
      .where(eq(bookLists.userId, userId)),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items,
    total,
    totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE),
  };
}

export async function getFollowedLists(userId: number, page: number = 1) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookLists.id,
        name: bookLists.name,
        description: bookLists.description,
        followerCount: bookLists.followerCount,
        itemCount: bookLists.itemCount,
        ownerUsername: users.publicUsername,
        ownerAvatarUrl: users.publicAvatarUrl,
        followedAt: bookListFollows.createdAt,
        coverImageUrl: sql<string | null>`(
          SELECT b.image_url FROM book_list_items bli
          JOIN books b ON b.id = bli.book_id
          WHERE bli.list_id = ${bookLists.id}
          ORDER BY bli.added_at ASC
          LIMIT 1
        )`,
      })
      .from(bookListFollows)
      .innerJoin(bookLists, eq(bookListFollows.listId, bookLists.id))
      .innerJoin(users, eq(bookLists.userId, users.id))
      .where(and(eq(bookListFollows.userId, userId), eq(bookLists.isPublic, 1)))
      .orderBy(desc(bookListFollows.createdAt))
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: count() })
      .from(bookListFollows)
      .innerJoin(bookLists, eq(bookListFollows.listId, bookLists.id))
      .where(and(eq(bookListFollows.userId, userId), eq(bookLists.isPublic, 1))),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items,
    total,
    totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE),
  };
}

export async function getFollowedQidianBooklists(userId: number, page: number = 1) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: qidianBooklists.id,
        title: qidianBooklists.title,
        titleTranslated: qidianBooklists.titleTranslated,
        followerCount: qidianBooklists.followerCount,
        daosearchFollowerCount: qidianBooklists.daosearchFollowerCount,
        bookCount: qidianBooklists.bookCount,
        followedAt: qidianBooklistFollows.createdAt,
        coverImageUrl: sql<string | null>`(
          SELECT b.image_url FROM qidian_booklist_items qbi
          JOIN books b ON b.id = qbi.book_id
          WHERE qbi.booklist_id = ${qidianBooklists.id}
          ORDER BY COALESCE(qbi.position, 2147483647) ASC, qbi.id ASC
          LIMIT 1
        )`,
      })
      .from(qidianBooklistFollows)
      .innerJoin(qidianBooklists, eq(qidianBooklistFollows.booklistId, qidianBooklists.id))
      .where(eq(qidianBooklistFollows.userId, userId))
      .orderBy(desc(qidianBooklistFollows.createdAt))
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: count() })
      .from(qidianBooklistFollows)
      .where(eq(qidianBooklistFollows.userId, userId)),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items,
    total,
    totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE),
  };
}

export async function getListDetail(listId: number, userId: number, page: number = 1, sort: BookSort = "bookmarked") {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const [listResult] = await db
    .select({
      id: bookLists.id,
      name: bookLists.name,
      description: bookLists.description,
      isPublic: bookLists.isPublic,
      followerCount: bookLists.followerCount,
    })
    .from(bookLists)
    .where(and(eq(bookLists.id, listId), eq(bookLists.userId, userId)))
    .limit(1);

  if (!listResult) return null;

  const orderByMap = {
    bookmarked: desc(bookListItems.addedAt),
    last_read: desc(sql`COALESCE(${readingProgresses.lastReadAt}, '1970-01-01'::timestamptz)`),
    recently_updated: desc(sql`COALESCE(${books.updateTime}, '1970-01-01'::timestamptz)`),
    unread: desc(sql`COALESCE(${bookStats.chapterCount}, 0) - COALESCE(${chapters.sequenceNumber}, 0)`),
  };

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookListItems.id,
        bookId: books.id,
        title: books.title,
        titleTranslated: books.titleTranslated,
        author: books.author,
        authorTranslated: books.authorTranslated,
        imageUrl: books.imageUrl,
        addedAt: bookListItems.addedAt,
        lastReadAt: readingProgresses.lastReadAt,
        bookUpdateTime: books.updateTime,
        chapterCount: bookStats.chapterCount,
        readChapterNumber: chapters.sequenceNumber,
      })
      .from(bookListItems)
      .innerJoin(books, eq(bookListItems.bookId, books.id))
      .leftJoin(readingProgresses, and(eq(readingProgresses.bookId, books.id), eq(readingProgresses.userId, userId)))
      .leftJoin(chapters, eq(readingProgresses.chapterId, chapters.id))
      .leftJoin(bookStats, eq(books.id, bookStats.bookId))
      .where(eq(bookListItems.listId, listId))
      .orderBy(orderByMap[sort])
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookListItems)
      .where(eq(bookListItems.listId, listId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return {
    list: listResult,
    items,
    total,
    totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE),
  };
}

export async function getReviewReplies(reviewId: number) {
  return db
    .select({
      id: reviewReplies.id,
      replyText: reviewReplies.replyText,
      createdAt: reviewReplies.createdAt,
      userDisplayName: users.displayName,
      userAvatarUrl: users.publicAvatarUrl,
    })
    .from(reviewReplies)
    .innerJoin(users, eq(reviewReplies.userId, users.id))
    .where(eq(reviewReplies.reviewId, reviewId))
    .orderBy(asc(reviewReplies.createdAt));
}

export async function getUserReplies(userId: number, page: number = 1) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const reviewAuthor = aliasedTable(users, "review_author");

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: reviewReplies.id,
        replyText: reviewReplies.replyText,
        createdAt: reviewReplies.createdAt,
        reviewId: bookReviews.id,
        reviewText: bookReviews.reviewText,
        reviewAuthorUsername: reviewAuthor.publicUsername,
        bookId: books.id,
        bookTitle: books.titleTranslated,
        bookTitleOriginal: books.title,
        bookImageUrl: books.imageUrl,
      })
      .from(reviewReplies)
      .innerJoin(bookReviews, eq(reviewReplies.reviewId, bookReviews.id))
      .innerJoin(books, eq(bookReviews.bookId, books.id))
      .innerJoin(reviewAuthor, eq(bookReviews.userId, reviewAuthor.id))
      .where(eq(reviewReplies.userId, userId))
      .orderBy(desc(reviewReplies.createdAt))
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(reviewReplies)
      .where(eq(reviewReplies.userId, userId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return { items, total, totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE) };
}

export async function getUserLikedReviews(userId: number, page: number = 1) {
  const offset = (page - 1) * ACCOUNT_PAGE_SIZE;

  const reviewAuthor = aliasedTable(users, "review_author");

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: reviewLikes.id,
        likedAt: reviewLikes.createdAt,
        reviewId: bookReviews.id,
        reviewText: bookReviews.reviewText,
        reviewAuthorUsername: reviewAuthor.publicUsername,
        reviewLikeCount: sql<number>`(SELECT count(*) FROM review_likes WHERE review_id = ${bookReviews.id})`,
        reviewReplyCount: sql<number>`(SELECT count(*) FROM review_replies WHERE review_id = ${bookReviews.id})`,
        bookId: books.id,
        bookTitle: books.titleTranslated,
        bookTitleOriginal: books.title,
        bookImageUrl: books.imageUrl,
      })
      .from(reviewLikes)
      .innerJoin(bookReviews, eq(reviewLikes.reviewId, bookReviews.id))
      .innerJoin(books, eq(bookReviews.bookId, books.id))
      .innerJoin(reviewAuthor, eq(bookReviews.userId, reviewAuthor.id))
      .where(eq(reviewLikes.userId, userId))
      .orderBy(desc(reviewLikes.createdAt))
      .limit(ACCOUNT_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(reviewLikes)
      .where(eq(reviewLikes.userId, userId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return { items, total, totalPages: Math.ceil(total / ACCOUNT_PAGE_SIZE) };
}

// ============================================================================
// Library queries
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

function getPopularityCutoff(period: PopularityPeriod): string | null {
  if (period === "all_time") return null;
  const d = new Date();
  if (period === "daily") d.setDate(d.getDate() - 1);
  else if (period === "weekly") d.setDate(d.getDate() - 7);
  else if (period === "monthly") d.setDate(d.getDate() - 30);
  return d.toISOString();
}

export async function getLibraryBooks(params: LibraryParams) {
  const {
    name, author, exactMatch, genreId, subgenreId, bookIds,
    minWords, maxWords, status, gender,
    updatedWithin, olderThan, tagIds,
    sort = "updated", popularityPeriod = "weekly", order = "desc", page,
  } = params;

  const offset = (page - 1) * LIBRARY_PAGE_SIZE;
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

  // Use fast estimated count when no user filters are applied (default landing)
  const hasFilters = !!(name || author || genreId || subgenreId || (bookIds && bookIds.length > 0) || minWords != null || maxWords != null || status || gender || updatedWithin || olderThan || (tagIds && tagIds.length > 0));

  // Always use the real count with the blacklisted filter — pg_class estimate doesn't exclude blacklisted genres
  const countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(books)
    .leftJoin(genres, eq(books.genreId, genres.id))
    .leftJoin(bookStats, eq(books.id, bookStats.bookId))
    .where(whereClause);

  if (readerCounts) {
    const [items, countResult] = await Promise.all([
      baseQuery
        .leftJoin(readerCounts, eq(books.id, readerCounts.bookId))
        .where(whereClause)
        .orderBy(orderFn(sortColumn), desc(books.id))
        .limit(LIBRARY_PAGE_SIZE)
        .offset(offset),
      countQuery,
    ]);
    const total = Number((countResult as { count: number }[])[0]?.count ?? 0);
    return { items, total, totalPages: Math.ceil(total / LIBRARY_PAGE_SIZE) };
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .where(whereClause)
      .orderBy(orderFn(sortColumn), desc(books.id))
      .limit(LIBRARY_PAGE_SIZE)
      .offset(offset),
    countQuery,
  ]);

  const total = Number((countResult as { count: number }[])[0]?.count ?? 0);
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

export async function getBookRecommendations(qqIds: number[]) {
  if (qqIds.length === 0) return [];

  const rows = await db
    .select({
      id: books.id,
      imageUrl: books.imageUrl,
      title: books.title,
      titleTranslated: books.titleTranslated,
      author: books.author,
      authorTranslated: books.authorTranslated,
      wordCount: books.wordCount,
      qqScore: books.qqScore,
    })
    .from(books)
    .where(inArray(books.url, qqIds.map((id) => `https://book.qq.com/book-detail/${id}`)))
    .limit(10);

  return rows;
}

export async function getBookRecommendationStats(bookIds: number[]) {
  if (bookIds.length === 0) return [];

  const rows = await db
    .select({
      bookId: bookStats.bookId,
      commentCount: bookStats.commentCount,
      ratingCount: bookStats.ratingCount,
      ratingPositive: bookStats.ratingPositive,
      ratingNeutral: bookStats.ratingNeutral,
      ratingNegative: bookStats.ratingNegative,
      reviewCount: bookStats.reviewCount,
    })
    .from(bookStats)
    .where(inArray(bookStats.bookId, bookIds));

  return rows;
}

export async function getBookRecommendationsWithStats(qqIds: number[]) {
  if (qqIds.length === 0) return [];

  const rows = await db
    .select({
      id: books.id,
      imageUrl: books.imageUrl,
      title: books.title,
      titleTranslated: books.titleTranslated,
      author: books.author,
      authorTranslated: books.authorTranslated,
      wordCount: books.wordCount,
      qqScore: books.qqScore,
      commentCount: sql<number>`COALESCE(${bookStats.commentCount}, 0)`,
      reviewCount: sql<number>`COALESCE(${bookStats.reviewCount}, 0)`,
      ratingCount: sql<number>`COALESCE(${bookStats.ratingCount}, 0)`,
      ratingPositive: sql<number>`COALESCE(${bookStats.ratingPositive}, 0)`,
      ratingNeutral: sql<number>`COALESCE(${bookStats.ratingNeutral}, 0)`,
      ratingNegative: sql<number>`COALESCE(${bookStats.ratingNegative}, 0)`,
    })
    .from(books)
    .leftJoin(bookStats, eq(books.id, bookStats.bookId))
    .where(inArray(books.url, qqIds.map((id) => `https://book.qq.com/book-detail/${id}`)))
    .limit(10);

  return rows;
}

// ============================================================================
// Community booklist queries
// ============================================================================

export type CommunityBooklistSort = "popular" | "recent" | "largest";

const COMMUNITY_BOOKLISTS_PAGE_SIZE_FIRST = PAGINATION_SIZE;
const COMMUNITY_BOOKLISTS_PAGE_SIZE_REST = PAGINATION_SIZE - 1;

export async function getCommunityBooklists({ page, sort }: { page: number; sort: CommunityBooklistSort }) {
  const limit = page === 1 ? COMMUNITY_BOOKLISTS_PAGE_SIZE_FIRST : COMMUNITY_BOOKLISTS_PAGE_SIZE_REST;
  const offset = page === 1 ? 0 : COMMUNITY_BOOKLISTS_PAGE_SIZE_FIRST + (page - 2) * COMMUNITY_BOOKLISTS_PAGE_SIZE_REST;
  const baseConditions = eq(bookLists.isPublic, 1);

  const orderByMap: Record<CommunityBooklistSort, SQL[]> = {
    popular: [
      desc(bookLists.followerCount),
      desc(bookLists.itemCount),
      desc(bookLists.updatedAt),
      desc(bookLists.id),
    ],
    recent: [
      desc(bookLists.updatedAt),
      desc(bookLists.followerCount),
      desc(bookLists.id),
    ],
    largest: [
      desc(bookLists.itemCount),
      desc(bookLists.followerCount),
      desc(bookLists.id),
    ],
  };

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: bookLists.id,
        name: bookLists.name,
        description: bookLists.description,
        followerCount: bookLists.followerCount,
        itemCount: bookLists.itemCount,
        updatedAt: bookLists.updatedAt,
        createdAt: bookLists.createdAt,
        ownerUsername: users.publicUsername,
        ownerAvatarUrl: users.publicAvatarUrl,
      })
      .from(bookLists)
      .innerJoin(users, eq(bookLists.userId, users.id))
      .where(baseConditions)
      .orderBy(...orderByMap[sort])
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookLists)
      .where(baseConditions),
  ]);

  const listIds = items.map((item) => item.id);

  const previews = listIds.length > 0
    ? await db
      .select({
        listId: bookListItems.listId,
        bookId: books.id,
        title: books.title,
        titleTranslated: books.titleTranslated,
        imageUrl: books.imageUrl,
      })
      .from(bookListItems)
      .innerJoin(books, eq(bookListItems.bookId, books.id))
      .where(inArray(bookListItems.listId, listIds))
      .orderBy(
        asc(bookListItems.listId),
        asc(bookListItems.addedAt),
        asc(bookListItems.id),
      )
    : [];

  const previewMap = new Map<number, typeof previews>();
  for (const preview of previews) {
    const current = previewMap.get(preview.listId) ?? [];
    if (current.length < 4) current.push(preview);
    previewMap.set(preview.listId, current);
  }

  // Fetch community tags for all lists
  const listTagRows = listIds.length > 0
    ? await db
      .select({
        listId: booklistTags.listId,
        tagId: tags.id,
        displayName: tags.displayName,
        count: sql<number>`count(distinct ${booklistTags.userId})`,
      })
      .from(booklistTags)
      .innerJoin(tags, eq(booklistTags.tagId, tags.id))
      .where(inArray(booklistTags.listId, listIds))
      .groupBy(booklistTags.listId, tags.id, tags.displayName)
      .orderBy(desc(sql`count(distinct ${booklistTags.userId})`))
    : [];

  const tagMap = new Map<number, { displayName: string; count: number }[]>();
  for (const row of listTagRows) {
    const current = tagMap.get(row.listId) ?? [];
    if (current.length < 6) current.push({ displayName: row.displayName, count: Number(row.count) });
    tagMap.set(row.listId, current);
  }

  const total = Number(countResult[0]?.count ?? 0);

  return {
    items: items.map((item, index) => ({
      ...item,
      position: offset + index + 1,
      previews: previewMap.get(item.id) ?? [],
      communityTags: tagMap.get(item.id) ?? [],
    })),
    total,
    totalPages: total <= COMMUNITY_BOOKLISTS_PAGE_SIZE_FIRST ? 1 : 1 + Math.ceil((total - COMMUNITY_BOOKLISTS_PAGE_SIZE_FIRST) / COMMUNITY_BOOKLISTS_PAGE_SIZE_REST),
  };
}

const COMMUNITY_BOOKLIST_DETAIL_PAGE_SIZE = 20;

export async function getCommunityBooklistDetail(listId: number, page: number = 1, currentUserId?: number | null) {
  const offset = (page - 1) * COMMUNITY_BOOKLIST_DETAIL_PAGE_SIZE;

  const booklist = await db
    .select({
      id: bookLists.id,
      name: bookLists.name,
      description: bookLists.description,
      isPublic: bookLists.isPublic,
      followerCount: bookLists.followerCount,
      itemCount: bookLists.itemCount,
      updatedAt: bookLists.updatedAt,
      createdAt: bookLists.createdAt,
      userId: bookLists.userId,
      ownerUsername: users.publicUsername,
      ownerAvatarUrl: users.publicAvatarUrl,
    })
    .from(bookLists)
    .innerJoin(users, eq(bookLists.userId, users.id))
    .where(and(eq(bookLists.id, listId), eq(bookLists.isPublic, 1)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!booklist) return null;

  const genre = aliasedTable(genres, "genre");

  const [items, countResult] = await Promise.all([
    db
      .select({
        itemId: bookListItems.id,
        addedAt: bookListItems.addedAt,
        bookId: books.id,
        title: books.title,
        titleTranslated: books.titleTranslated,
        author: books.author,
        authorTranslated: books.authorTranslated,
        imageUrl: books.imageUrl,
        synopsisTranslated: books.synopsisTranslated,
        wordCount: books.wordCount,
        qqScore: books.qqScore,
        genreName: genre.name,
        genreNameTranslated: genre.nameTranslated,
        commentCount: bookStats.commentCount,
        reviewCount: bookStats.reviewCount,
        ratingCount: bookStats.ratingCount,
        ratingPositive: bookStats.ratingPositive,
        ratingNeutral: bookStats.ratingNeutral,
        ratingNegative: bookStats.ratingNegative,
        curatorComment: sql<string | null>`(
          SELECT review_text FROM book_reviews
          WHERE user_id = ${booklist.userId} AND book_id = ${books.id}
          LIMIT 1
        )`,
        curatorReviewLikeCount: sql<number>`COALESCE((
          SELECT count(*) FROM review_likes
          WHERE review_id = (
            SELECT id FROM book_reviews
            WHERE user_id = ${booklist.userId} AND book_id = ${books.id}
            LIMIT 1
          )
        ), 0)`,
      })
      .from(bookListItems)
      .innerJoin(books, eq(bookListItems.bookId, books.id))
      .leftJoin(genre, eq(books.genreId, genre.id))
      .leftJoin(bookStats, eq(books.id, bookStats.bookId))
      .where(eq(bookListItems.listId, listId))
      .orderBy(asc(bookListItems.addedAt), asc(bookListItems.id))
      .limit(COMMUNITY_BOOKLIST_DETAIL_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookListItems)
      .where(eq(bookListItems.listId, listId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  let userHasFollowed = false;
  if (currentUserId) {
    const [follow] = await db
      .select({ id: bookListFollows.id })
      .from(bookListFollows)
      .where(and(eq(bookListFollows.userId, currentUserId), eq(bookListFollows.listId, listId)))
      .limit(1);
    userHasFollowed = !!follow;
  }

  return {
    booklist,
    items,
    total,
    totalPages: Math.ceil(total / COMMUNITY_BOOKLIST_DETAIL_PAGE_SIZE),
    userHasFollowed,
  };
}

export async function getBookCommunityBooklists(bookId: number, page: number = 1) {
  const offset = (page - 1) * BOOKLIST_ITEMS_PAGE_SIZE;

  const [items, countResult] = await Promise.all([
    db
      .select({
        listId: bookLists.id,
        name: bookLists.name,
        followerCount: bookLists.followerCount,
        itemCount: bookLists.itemCount,
        ownerUsername: users.publicUsername,
        curatorComment: sql<string | null>`(
          SELECT review_text FROM book_reviews
          WHERE user_id = ${bookLists.userId} AND book_id = ${bookId}
          LIMIT 1
        )`,
      })
      .from(bookListItems)
      .innerJoin(bookLists, eq(bookListItems.listId, bookLists.id))
      .innerJoin(users, eq(bookLists.userId, users.id))
      .where(and(eq(bookListItems.bookId, bookId), eq(bookLists.isPublic, 1)))
      .orderBy(desc(bookLists.followerCount))
      .limit(BOOKLIST_ITEMS_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookListItems)
      .innerJoin(bookLists, eq(bookListItems.listId, bookLists.id))
      .where(and(eq(bookListItems.bookId, bookId), eq(bookLists.isPublic, 1))),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return { items, total };
}

// ============================================================================
// Notification queries
// ============================================================================

const NOTIFICATION_PAGE_SIZE = 30;

export async function getUserNotifications(userId: number, page: number = 1) {
  const offset = (page - 1) * NOTIFICATION_PAGE_SIZE;

  const [items, countResult, unreadResult] = await Promise.all([
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        metadata: notifications.metadata,
        read: notifications.read,
        createdAt: notifications.createdAt,
        actorId: notifications.actorId,
        actorUsername: users.publicUsername,
        actorAvatarUrl: users.publicAvatarUrl,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorId, users.id))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.id))
      .limit(NOTIFICATION_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: count() })
      .from(notifications)
      .where(eq(notifications.userId, userId)),
    db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false))),
  ]);

  const total = countResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / NOTIFICATION_PAGE_SIZE);

  return {
    items: items.map((r) => ({
      ...r,
      metadata: JSON.parse(r.metadata),
    })),
    total,
    totalPages,
    unreadCount: unreadResult[0]?.count ?? 0,
  };
}

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

// ============================================================================
// RSS feed queries
// ============================================================================

export async function getRecentBooks(limit: number = 50) {
  return db
    .select({
      id: books.id,
      title: books.title,
      titleTranslated: books.titleTranslated,
      author: books.author,
      authorTranslated: books.authorTranslated,
      synopsis: books.synopsis,
      synopsisTranslated: books.synopsisTranslated,
      genreName: genres.nameTranslated,
      createdAt: books.createdAt,
    })
    .from(books)
    .leftJoin(genres, eq(books.genreId, genres.id))
    .where(isNotNull(books.title))
    .orderBy(desc(books.createdAt))
    .limit(limit);
}

export const getPopularBooksForCompare = unstable_cache(
  async () => {
    return db
      .select({
        id: books.id,
        title: books.title,
        titleTranslated: books.titleTranslated,
        author: books.author,
        authorTranslated: books.authorTranslated,
        imageUrl: books.imageUrl,
        genreName: genres.nameTranslated,
        readerCount: bookStats.readerCount,
        qqScore: books.qqScore,
        wordCount: books.wordCount,
      })
      .from(books)
      .leftJoin(genres, eq(books.genreId, genres.id))
      .leftJoin(bookStats, eq(books.id, bookStats.bookId))
      .where(and(isNotNull(books.titleTranslated), isNotNull(books.imageUrl), eq(genres.blacklisted, false)))
      .orderBy(desc(bookStats.readerCount))
      .limit(12);
  },
  ["popular-books-compare"],
  { revalidate: 3600 },
);

export async function getReaderOverlap(bookId1: number, bookId2: number) {
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT rp1.user_id)::int AS count
    FROM reading_progresses rp1
    JOIN reading_progresses rp2 ON rp1.user_id = rp2.user_id
    WHERE rp1.book_id = ${bookId1} AND rp2.book_id = ${bookId2}
  `);
  const rows = getRawQueryRows(result);
  return getNumberValue(rows[0]?.count);
}

// ============================================================================
// Homepage queries
// ============================================================================

async function getTopRatedBooksForHomepage() {
  const items = await db
    .select({
      bookId: books.id,
      title: books.title,
      titleTranslated: books.titleTranslated,
      author: books.author,
      authorTranslated: books.authorTranslated,
      imageUrl: books.imageUrl,
      genreName: genres.name,
      genreNameTranslated: genres.nameTranslated,
      wordCount: books.wordCount,
      qqScore: books.qqScore,
      qqScoreCount: books.qqScoreCount,
    })
    .from(books)
    .leftJoin(genres, eq(books.genreId, genres.id))
    .where(
      and(
        isNotNull(books.qqScore),
        sql`${books.qqScore} ~ '^[0-9]+\\.?[0-9]*$'`,
        sql`${books.qqScore}::float >= 8.0`,
        sql`COALESCE(${books.qqScoreCount}, 0) >= 100`,
        sql`(${books.genreId} IS NULL OR ${genres.blacklisted} = false)`,
      ),
    )
    .orderBy(desc(sql`${books.qqScore}::float`), desc(sql`COALESCE(${books.qqScoreCount}, 0)`))
    .limit(10);
  return items;
}

async function getRecentlyUpdatedBooksForHomepage() {
  const items = await db
    .select({
      bookId: books.id,
      title: books.title,
      titleTranslated: books.titleTranslated,
      author: books.author,
      authorTranslated: books.authorTranslated,
      imageUrl: books.imageUrl,
      genreName: genres.name,
      genreNameTranslated: genres.nameTranslated,
      wordCount: books.wordCount,
      qqScore: books.qqScore,
      updateTime: books.updateTime,
    })
    .from(books)
    .leftJoin(genres, eq(books.genreId, genres.id))
    .where(
      and(
        isNotNull(books.title),
        isNotNull(books.updateTime),
        sql`(${books.genreId} IS NULL OR ${genres.blacklisted} = false)`,
      ),
    )
    .orderBy(desc(books.updateTime))
    .limit(10);
  return items;
}

async function getLatestQidianCommentsForHomepage() {
  const items = await db
    .select({
      id: bookComments.id,
      title: bookComments.title,
      titleTranslated: bookComments.titleTranslated,
      content: bookComments.content,
      contentTranslated: bookComments.contentTranslated,
      images: bookComments.images,
      agreeCount: bookComments.agreeCount,
      replyCount: bookComments.replyCount,
      commentCreatedAt: bookComments.commentCreatedAt,
      qqUserNickname: qqUsers.nickname,
      qqUserNicknameTranslated: qqUsers.nicknameTranslated,
      qqUserIconUrl: qqUsers.iconUrl,
      bookId: books.id,
      bookTitle: books.titleTranslated,
      bookTitleOriginal: books.title,
      bookImageUrl: books.imageUrl,
    })
    .from(bookComments)
    .innerJoin(qqUsers, eq(bookComments.qqUserId, qqUsers.id))
    .innerJoin(books, eq(bookComments.bookId, books.id))
    .where(isNotNull(bookComments.contentTranslated))
    .orderBy(desc(bookComments.commentCreatedAt))
    .limit(6);
  return items;
}

// Individual cached homepage queries — each caches independently so
// cold starts only re-fetch stale slices instead of everything.
const getHomepageRankingsMale = unstable_cache(
  async () => (await getRankings({ gender: "male", rankType: "popular", cycle: "cycle-2", page: 1 })).items.slice(0, 10),
  ["homepage-rankings-male"],
  { revalidate: 900 },
);
const getHomepageRankingsFemale = unstable_cache(
  async () => (await getRankings({ gender: "female", rankType: "popular", cycle: "cycle-2", page: 1 })).items.slice(0, 10),
  ["homepage-rankings-female"],
  { revalidate: 900 },
);
const getHomepageTopRated = unstable_cache(
  async () => (await getRankings({ gender: "male", rankType: "popular", cycle: "cycle-4", page: 1 })).items.slice(0, 10),
  ["homepage-top-rated"],
  { revalidate: 900 },
);
const getHomepageCommunityRankings = unstable_cache(
  async () => (await getCommunityRankings({ period: "weekly", page: 1 })).items.slice(0, 10),
  ["homepage-community-rankings"],
  { revalidate: 900 },
);
const getHomepageBooklists = unstable_cache(
  async () => (await getQidianBooklists({ page: 1, sort: "recent" })).items.slice(0, 8),
  ["homepage-booklists"],
  { revalidate: 900 },
);
const getHomepageFeed = unstable_cache(
  async () => (await getDaoSearchFeed(1)).items.slice(0, 5),
  ["homepage-feed"],
  { revalidate: 900 },
);
const getHomepageComments = unstable_cache(
  async () => getLatestQidianCommentsForHomepage(),
  ["homepage-comments"],
  { revalidate: 900 },
);
const getHomepageRecentlyUpdated = unstable_cache(
  async () => getRecentlyUpdatedBooksForHomepage(),
  ["homepage-recently-updated"],
  { revalidate: 900 },
);
const getHomepageGenres = unstable_cache(
  async () => getPrimaryGenres(),
  ["homepage-genres"],
  { revalidate: 3600 },
);

export async function getHomepageData() {
  const [stats, rankingsMale, rankingsFemale, communityRankings, booklists, feed, topComments, topRated, recentlyUpdated, genres] = await Promise.all([
    getDbStats(),
    getHomepageRankingsMale(),
    getHomepageRankingsFemale(),
    getHomepageCommunityRankings(),
    getHomepageBooklists(),
    getHomepageFeed(),
    getHomepageComments(),
    getHomepageTopRated(),
    getHomepageRecentlyUpdated(),
    getHomepageGenres(),
  ]);
  return { stats, rankingsMale, rankingsFemale, communityRankings, booklists, feed, topComments, topRated, recentlyUpdated, genres };
}
