import { db } from "@/db";
import { books, genres, chapters, bookComments, bookStats, bookReviews, bookRatings, bookmarks, bookLists, bookListItems, bookListFollows, reviewReplies, users, qidianBooklists, qidianBooklistItems, qqUsers, tags, bookTags } from "@/db/schema";
import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import Redis from "ioredis";
import { env } from "../env";

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
          (SELECT count(*) FROM ${books} b INNER JOIN ${genres} g ON b.genre_id = g.id INNER JOIN qq_chart_entries qce ON qce.book_id = b.id) AS rankings,
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
