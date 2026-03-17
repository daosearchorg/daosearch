import { db } from "@/db";
import { books, bookComments, qqUsers } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { PAGINATION_SIZE } from "../constants";

// ============================================================================
// Feed helper utilities
// ============================================================================

type RawQueryRow = Record<string, unknown>;

function isRawQueryRow(value: unknown): value is RawQueryRow {
  return typeof value === "object" && value !== null;
}

export function getRawQueryRows(result: unknown): RawQueryRow[] {
  if (Array.isArray(result)) return result.filter(isRawQueryRow);
  if (isRawQueryRow(result) && Array.isArray(result.rows)) {
    return result.rows.filter(isRawQueryRow);
  }
  return [];
}

export function getNumberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function getNullableNumberValue(value: unknown): number | null {
  return value == null ? null : getNumberValue(value);
}

export function getStringValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function getNullableStringValue(value: unknown): string | null {
  return value == null ? null : getStringValue(value);
}

// ============================================================================
// Latest Qidian comments (global feed)
// ============================================================================

const FEED_PAGE_SIZE = PAGINATION_SIZE;

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
