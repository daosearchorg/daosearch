import { db } from "@/db";
import { books, genres, bookStats, bookLists, bookListItems, bookListFollows, booklistTags, tags, users, qidianBooklists, qidianBooklistItems, qidianBooklistFollows } from "@/db/schema";
import { count } from "drizzle-orm";
import { eq, and, or, gte, lte, ilike, sql, asc, desc, isNotNull, aliasedTable, inArray, arrayOverlaps, type SQL } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { PAGINATION_SIZE, type BooklistSort } from "../constants";
import { getRawQueryRows, getNumberValue, getStringValue } from "./feeds";

// ============================================================================
// Qidian booklist queries
// ============================================================================

const BOOKLISTS_PAGE_SIZE_FIRST = PAGINATION_SIZE - 1; // 49: 3 podium + 46 grid (even)
const BOOKLISTS_PAGE_SIZE_REST = PAGINATION_SIZE - 2;  // 48: even for 2-col grid

// Kept as an alias for callers that imported the legacy type name (homepage,
// v1 API route). Functionally equivalent to BooklistSort.
export type QidianBooklistSort = BooklistSort;

interface QidianBooklistFilters {
  page: number;
  sort: BooklistSort;
  order?: "asc" | "desc";
  name?: string;
  tags?: string[];
  minFollowers?: number;
  maxFollowers?: number;
  minBookCount?: number;
  maxBookCount?: number;
  updatedWithin?: number;
}

export async function getQidianBooklists({
  page,
  sort,
  order = "desc",
  name,
  tags: tagFilter,
  minFollowers,
  maxFollowers,
  minBookCount,
  maxBookCount,
  updatedWithin,
}: QidianBooklistFilters) {
  const limit = page === 1 ? BOOKLISTS_PAGE_SIZE_FIRST : BOOKLISTS_PAGE_SIZE_REST;
  const offset = page === 1 ? 0 : BOOKLISTS_PAGE_SIZE_FIRST + (page - 2) * BOOKLISTS_PAGE_SIZE_REST;

  const conditions: SQL[] = [isNotNull(qidianBooklists.title)];
  if (name && name.trim()) {
    const pat = `%${name.trim()}%`;
    const titleMatch = or(
      ilike(qidianBooklists.title, pat),
      ilike(qidianBooklists.titleTranslated, pat),
    );
    if (titleMatch) conditions.push(titleMatch);
  }
  if (tagFilter && tagFilter.length > 0) {
    // PG array overlap — match if any selected tag is present in tagsTranslated.
    // `arrayOverlaps` emits `col && ARRAY[$1,$2,...]::text[]`, which is what
    // we need; `sql\`...${tagFilter}::text[]\`` would flatten the array into
    // separate positional params and break the cast.
    conditions.push(arrayOverlaps(qidianBooklists.tagsTranslated, tagFilter));
  }
  if (minFollowers != null) {
    conditions.push(sql`COALESCE(${qidianBooklists.followerCount}, 0) >= ${minFollowers}`);
  }
  if (maxFollowers != null) {
    conditions.push(sql`COALESCE(${qidianBooklists.followerCount}, 0) <= ${maxFollowers}`);
  }
  if (minBookCount != null) {
    conditions.push(sql`COALESCE(${qidianBooklists.bookCount}, 0) >= ${minBookCount}`);
  }
  if (maxBookCount != null) {
    conditions.push(sql`COALESCE(${qidianBooklists.bookCount}, 0) <= ${maxBookCount}`);
  }
  if (updatedWithin) {
    conditions.push(
      sql`COALESCE(${qidianBooklists.lastUpdatedAt}, ${qidianBooklists.updatedAt}) >= NOW() - make_interval(days => ${updatedWithin})`,
    );
  }
  const whereClause = and(...conditions)!;

  const matchedCounts = db
    .select({
      booklistId: qidianBooklistItems.booklistId,
      matchedBookCount: sql<number>`count(*) filter (where ${qidianBooklistItems.bookId} is not null)`.as("matched_book_count"),
    })
    .from(qidianBooklistItems)
    .groupBy(qidianBooklistItems.booklistId)
    .as("matched_counts");

  // Relevance ranks substring hits: exact > prefix > contains, breaking ties on
  // followerCount. Used only when `name` is set; otherwise sort falls back to
  // the structural orders below.
  const lowerName = name?.trim().toLowerCase() ?? "";
  const relevanceExpr = name
    ? sql`(
        CASE
          WHEN LOWER(COALESCE(${qidianBooklists.titleTranslated}, ${qidianBooklists.title})) = ${lowerName} THEN 3
          WHEN LOWER(COALESCE(${qidianBooklists.titleTranslated}, ${qidianBooklists.title})) LIKE ${`${lowerName}%`} THEN 2
          ELSE 1
        END
      )`
    : sql`0`;

  const ord = (e: SQL) => (order === "asc" ? asc(e) : desc(e));

  const orderByMap: Record<BooklistSort, SQL[]> = {
    popular: [
      ord(sql`COALESCE(${qidianBooklists.followerCount}, 0)`),
      desc(sql`COALESCE(${matchedCounts.matchedBookCount}, 0)`),
      desc(sql`COALESCE(${qidianBooklists.bookCount}, 0)`),
      desc(sql`COALESCE(${qidianBooklists.lastUpdatedAt}, ${qidianBooklists.updatedAt})`),
      desc(qidianBooklists.id),
    ],
    recent: [
      ord(sql`COALESCE(${qidianBooklists.lastUpdatedAt}, ${qidianBooklists.updatedAt})`),
      desc(sql`COALESCE(${qidianBooklists.followerCount}, 0)`),
      desc(qidianBooklists.id),
    ],
    largest: [
      ord(sql`COALESCE(${qidianBooklists.bookCount}, 0)`),
      desc(sql`COALESCE(${matchedCounts.matchedBookCount}, 0)`),
      desc(sql`COALESCE(${qidianBooklists.followerCount}, 0)`),
      desc(qidianBooklists.id),
    ],
    relevance: [
      desc(relevanceExpr),
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
      .where(whereClause)
      .orderBy(...orderByMap[sort])
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(qidianBooklists)
      .where(whereClause),
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

// Alias for legacy callers.
export type CommunityBooklistSort = BooklistSort;

// Matches the Qidian booklist pagination: 49 on page 1 (3 podium + 46 in
// 2-col grid = 23 even rows), 48 on subsequent pages (24 even rows).
const COMMUNITY_BOOKLISTS_PAGE_SIZE_FIRST = PAGINATION_SIZE - 1;
const COMMUNITY_BOOKLISTS_PAGE_SIZE_REST = PAGINATION_SIZE - 2;

interface CommunityBooklistFilters {
  page: number;
  sort: BooklistSort;
  order?: "asc" | "desc";
  name?: string;
  tagIds?: number[];
  minFollowers?: number;
  maxFollowers?: number;
  minBookCount?: number;
  maxBookCount?: number;
  updatedWithin?: number;
}

export async function getCommunityBooklists({
  page,
  sort,
  order = "desc",
  name,
  tagIds,
  minFollowers,
  maxFollowers,
  minBookCount,
  maxBookCount,
  updatedWithin,
}: CommunityBooklistFilters) {
  const limit = page === 1 ? COMMUNITY_BOOKLISTS_PAGE_SIZE_FIRST : COMMUNITY_BOOKLISTS_PAGE_SIZE_REST;
  const offset = page === 1 ? 0 : COMMUNITY_BOOKLISTS_PAGE_SIZE_FIRST + (page - 2) * COMMUNITY_BOOKLISTS_PAGE_SIZE_REST;

  const conditions: SQL[] = [eq(bookLists.isPublic, 1)];
  if (name && name.trim()) {
    const pat = `%${name.trim()}%`;
    const nameMatch = or(ilike(bookLists.name, pat), ilike(bookLists.description, pat));
    if (nameMatch) conditions.push(nameMatch);
  }
  if (tagIds && tagIds.length > 0) {
    // Same AND-semantics + 2-user threshold as the library books tag filter.
    for (const tagId of tagIds) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM booklist_tags blt
        WHERE blt.list_id = ${bookLists.id} AND blt.tag_id = ${tagId}
        GROUP BY blt.list_id
        HAVING count(distinct blt.user_id) >= 2
      )`);
    }
  }
  if (minFollowers != null) {
    conditions.push(gte(bookLists.followerCount, minFollowers));
  }
  if (maxFollowers != null) {
    conditions.push(lte(bookLists.followerCount, maxFollowers));
  }
  if (minBookCount != null) {
    conditions.push(gte(bookLists.itemCount, minBookCount));
  }
  if (maxBookCount != null) {
    conditions.push(lte(bookLists.itemCount, maxBookCount));
  }
  if (updatedWithin) {
    conditions.push(sql`${bookLists.updatedAt} >= NOW() - make_interval(days => ${updatedWithin})`);
  }
  const whereClause = and(...conditions)!;

  const lowerName = name?.trim().toLowerCase() ?? "";
  const relevanceExpr = name
    ? sql`(
        CASE
          WHEN LOWER(${bookLists.name}) = ${lowerName} THEN 3
          WHEN LOWER(${bookLists.name}) LIKE ${`${lowerName}%`} THEN 2
          ELSE 1
        END
      )`
    : sql`0`;

  const ord = <T extends Parameters<typeof asc>[0]>(e: T) => (order === "asc" ? asc(e) : desc(e));

  const orderByMap: Record<BooklistSort, SQL[]> = {
    popular: [
      ord(bookLists.followerCount),
      desc(bookLists.itemCount),
      desc(bookLists.updatedAt),
      desc(bookLists.id),
    ],
    recent: [
      ord(bookLists.updatedAt),
      desc(bookLists.followerCount),
      desc(bookLists.id),
    ],
    largest: [
      ord(bookLists.itemCount),
      desc(bookLists.followerCount),
      desc(bookLists.id),
    ],
    relevance: [
      desc(relevanceExpr),
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
      .where(whereClause)
      .orderBy(...orderByMap[sort])
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookLists)
      .where(whereClause),
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

  const tagMap = new Map<number, { id: number; displayName: string; count: number }[]>();
  for (const row of listTagRows) {
    const current = tagMap.get(row.listId) ?? [];
    if (current.length < 6) current.push({ id: row.tagId, displayName: row.displayName, count: Number(row.count) });
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

// ============================================================================
// Tag cloud — feeds the Qidian tag-chip picker in the booklist filter bar.
// Aggregates over the text[] tagsTranslated arrays across all Qidian booklists.
// ============================================================================

export const getQidianBooklistTagCloud = unstable_cache(
  async () => {
    const result = await db.execute(sql`
      SELECT tag, COUNT(*)::int AS count
      FROM (
        SELECT unnest(tags_translated) AS tag
        FROM qidian_booklists
        WHERE tags_translated IS NOT NULL
      ) t
      WHERE tag IS NOT NULL AND tag <> ''
      GROUP BY tag
      ORDER BY count DESC, tag ASC
      LIMIT 40
    `);
    return getRawQueryRows(result).map((r) => ({
      tag: getStringValue(r.tag),
      count: getNumberValue(r.count),
    }));
  },
  ["qidian-booklist-tag-cloud"],
  { revalidate: 3600 },
);

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
