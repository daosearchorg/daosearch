import { getRecentBooks } from "@/lib/queries";
import { buildRss, rssResponse, BASE_URL } from "@/lib/rss";
import { bookUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const books = await getRecentBooks(50);

  const xml = buildRss({
    title: "DaoSearch — New Books",
    description: "Recently added web novel raws on DaoSearch",
    link: `${BASE_URL}/rss/books`,
    items: books.map((book) => {
      const title = book.titleTranslated || book.title || `Book ${book.id}`;
      const author = book.authorTranslated || book.author || "Unknown";
      const synopsis = book.synopsisTranslated || book.synopsis || "";
      const genre = book.genreName ? `[${book.genreName}] ` : "";

      return {
        title: `${title} by ${author}`,
        link: `${BASE_URL}${bookUrl(book.id, book.titleTranslated || book.title)}`,
        description: `${genre}${synopsis}`.slice(0, 500),
        pubDate: book.createdAt ?? new Date(),
        guid: `${BASE_URL}/book/${book.id}`,
        author,
      };
    }),
  });

  return rssResponse(xml);
}
