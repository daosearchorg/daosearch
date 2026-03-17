import { db } from "@/db";
import { books, genres, chapters, bookStats, bookComments, bookReviews, bookRatings, bookListItems, bookLists, users, qqChartEntries, qqUsers, qidianBooklistItems, qidianBooklists, readingProgressHistories, readingProgresses } from "@/db/schema";
import { eq, and, sql, asc, desc, isNotNull, aliasedTable, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { REVIEWS_PAGE_SIZE, PAGINATION_SIZE } from "../constants";
import { getRawQueryRows, getNumberValue } from "./feeds";

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

const BOOK_BOOKLIST_PAGE_SIZE = 4;

export async function getBookBooklists(bookId: number, page: number = 1) {
  const offset = (page - 1) * BOOK_BOOKLIST_PAGE_SIZE;

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
      .limit(BOOK_BOOKLIST_PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(qidianBooklistItems)
      .innerJoin(qidianBooklists, eq(qidianBooklistItems.booklistId, qidianBooklists.id))
      .where(eq(qidianBooklistItems.bookId, bookId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  // Fetch 4 preview book covers per booklist
  const booklistIds = items.map((i) => i.booklistId);
  let previewsMap: Record<number, { bookId: number; imageUrl: string | null; title: string | null; titleTranslated: string | null }[]> = {};
  if (booklistIds.length > 0) {
    const previews = await db
      .select({
        booklistId: qidianBooklistItems.booklistId,
        bookId: books.id,
        imageUrl: books.imageUrl,
        title: books.title,
        titleTranslated: books.titleTranslated,
      })
      .from(qidianBooklistItems)
      .innerJoin(books, eq(qidianBooklistItems.bookId, books.id))
      .where(
        and(
          inArray(qidianBooklistItems.booklistId, booklistIds),
          isNotNull(books.imageUrl),
        ),
      )
      .orderBy(qidianBooklistItems.position)
      .limit(booklistIds.length * 4);

    for (const p of previews) {
      if (!previewsMap[p.booklistId]) previewsMap[p.booklistId] = [];
      if (previewsMap[p.booklistId].length < 4) {
        previewsMap[p.booklistId].push(p);
      }
    }
  }

  const itemsWithPreviews = items.map((item) => ({
    ...item,
    previews: previewsMap[item.booklistId] || [],
  }));

  return { items: itemsWithPreviews, total };
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

export async function getBookCommunityBooklists(bookId: number, page: number = 1) {
  const BOOKLIST_ITEMS_PAGE_SIZE = 10;
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
// RSS feed / compare queries
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
