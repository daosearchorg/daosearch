import { db } from "@/db";
import { books, genres, chapters, bookStats, bookReviews, bookRatings, bookmarks, bookLists, bookListItems, bookListFollows, readingProgresses, reviewLikes, reviewReplies, users, notifications, tags, bookTags, booklistTags } from "@/db/schema";
import { count } from "drizzle-orm";
import { eq, and, sql, asc, desc, aliasedTable } from "drizzle-orm";
import { PAGINATION_SIZE } from "../constants";
import type { BookSort } from "../types";

// ============================================================================
// User account queries
// ============================================================================

const ACCOUNT_PAGE_SIZE = PAGINATION_SIZE;

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
