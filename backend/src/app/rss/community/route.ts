import { getDaoSearchFeed } from "@/lib/queries";
import { buildRss, rssResponse, BASE_URL } from "@/lib/rss";
import { bookUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

function describeActivity(item: {
  activityType: string;
  ratingValue: number | null;
  reviewText: string | null;
  replyText: string | null;
  chapterTitle: string | null;
  chapterNumber: number | null;
  bookTitle: string | null;
  bookTitleOriginal: string | null;
  listName: string | null;
  listType: string | null;
  username: string;
}): { title: string; description: string } {
  const book = item.bookTitle || item.bookTitleOriginal || "a book";
  const user = item.username;

  switch (item.activityType) {
    case "rating": {
      const label = item.ratingValue === 1 ? "upvoted" : item.ratingValue === -1 ? "downvoted" : "rated";
      return { title: `${user} ${label} ${book}`, description: "" };
    }
    case "review":
      return {
        title: `${user} reviewed ${book}`,
        description: (item.reviewText || "").slice(0, 500),
      };
    case "reply":
      return {
        title: `${user} replied to a review on ${book}`,
        description: (item.replyText || "").slice(0, 500),
      };
    case "bookmark":
      return { title: `${user} bookmarked ${book}`, description: "" };
    case "read": {
      const ch = item.chapterTitle
        ? `Chapter ${item.chapterNumber}: ${item.chapterTitle}`
        : item.chapterNumber
          ? `Chapter ${item.chapterNumber}`
          : "";
      return {
        title: `${user} is reading ${book}`,
        description: ch ? `Read up to ${ch}` : "",
      };
    }
    case "list_follow": {
      const list = item.listName || "a list";
      const prefix = item.listType === "qidian" ? "official booklist" : "community list";
      return { title: `${user} followed ${prefix}: ${list}`, description: "" };
    }
    default:
      return { title: `${user} did something on ${book}`, description: "" };
  }
}

export async function GET() {
  const { items } = await getDaoSearchFeed(1);

  const xml = buildRss({
    title: "DaoSearch — Community Activity",
    description: "Latest community activity on DaoSearch — reviews, ratings, bookmarks, and reading updates",
    link: `${BASE_URL}/rss/community`,
    items: items.map((item, i) => {
      const { title, description } = describeActivity(item);
      const link = item.bookId
        ? `${BASE_URL}${bookUrl(item.bookId, item.bookTitle || item.bookTitleOriginal)}`
        : item.listId
          ? `${BASE_URL}/daosearch/booklists/${item.listId}`
          : `${BASE_URL}/daosearch/feed`;

      return {
        title,
        link,
        description,
        pubDate: item.activityAt,
        guid: `${BASE_URL}/feed/community/${item.activityType}-${item.activityAt}-${i}`,
      };
    }),
  });

  return rssResponse(xml);
}
