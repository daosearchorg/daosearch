import { db } from "@/db";
import { books, genres, bookStats, bookLists, bookListItems, bookListFollows, booklistTags, tags, users, qidianBooklists, qidianBooklistItems, qidianBooklistFollows } from "@/db/schema";
import { count } from "drizzle-orm";
import { eq, and, sql, asc, desc, isNotNull, aliasedTable, inArray, type SQL } from "drizzle-orm";
import { PAGINATION_SIZE } from "../constants";

// ============================================================================
// Qidian booklist queries
// ============================================================================

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

// ============================================================================
// User followed booklist queries
// ============================================================================

const ACCOUNT_PAGE_SIZE = PAGINATION_SIZE;

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
