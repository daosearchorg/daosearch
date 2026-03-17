import { db } from "@/db";
import { books, genres, bookComments, qqUsers } from "@/db/schema";
import { eq, and, sql, desc, isNotNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getRankings, getCommunityRankings } from "./rankings";
import { getQidianBooklists } from "./booklists";
import { getDaoSearchFeed } from "./feeds";
import { getDbStats } from "./stats";
import { getPrimaryGenres } from "./genres";

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
    .limit(14);
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
  async () => (await getRankings({ gender: "male", rankType: "popular", cycle: "cycle-4", page: 1 })).items.slice(0, 14),
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
