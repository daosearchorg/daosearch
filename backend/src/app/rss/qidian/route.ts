import { getLatestQidianComments } from "@/lib/queries";
import { buildRss, rssResponse, BASE_URL } from "@/lib/rss";
import { bookUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const { items } = await getLatestQidianComments(1);

  const xml = buildRss({
    title: "DaoSearch — Reader Comments",
    description: "Latest reader comments on DaoSearch",
    link: `${BASE_URL}/rss/qidian`,
    items: items.map((item) => {
      const bookTitle = item.bookTitle || item.bookTitleOriginal || "Unknown Book";
      const nickname = item.qqUserNicknameTranslated || item.qqUserNickname || "Anonymous";
      const commentTitle = item.titleTranslated || item.title || "";
      const content = item.contentTranslated || item.content || "";

      return {
        title: commentTitle
          ? `${nickname} on ${bookTitle}: ${commentTitle}`
          : `${nickname} commented on ${bookTitle}`,
        link: `${BASE_URL}${bookUrl(item.bookId, item.bookTitle || item.bookTitleOriginal)}`,
        description: content.slice(0, 500),
        pubDate: item.commentCreatedAt ?? new Date(),
        guid: `${BASE_URL}/qidian/comment/${item.id}`,
        author: nickname,
      };
    }),
  });

  return rssResponse(xml);
}
