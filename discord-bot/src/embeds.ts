import { EmbedBuilder } from "discord.js";
import type { BookSummary, BookDetail, RankingItem, Stats, Genre, Booklist, Comment, Review, Tag } from "./api.js";

const BRAND_COLOR = 0x7C3AED;
const ERROR_COLOR = 0xEF4444;
const SITE_URL = "https://daosearch.io";

function bookUrl(id: number) {
  return `${SITE_URL}/book/${id}`;
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatWordCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 10_000) return Math.round(n / 10_000) + "万 (" + formatNumber(n) + ")";
  return formatNumber(n);
}

function displayTitle(book: { title: string; titleTranslated: string | null }): string {
  return book.titleTranslated || book.title;
}

function displayAuthor(book: { author: string; authorTranslated: string | null }): string {
  return book.authorTranslated || book.author;
}

export function bookEmbed(book: BookDetail): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(truncate(displayTitle(book), 256))
    .setURL(bookUrl(book.id))
    .setAuthor({ name: displayAuthor(book) });

  if (book.imageUrl) {
    embed.setThumbnail(book.imageUrl);
  }

  const genre = book.genreNameTranslated || book.genreName;
  if (genre) embed.addFields({ name: "Genre", value: genre, inline: true });

  const status = book.statusTranslated || book.status;
  if (status) embed.addFields({ name: "Status", value: status, inline: true });

  embed.addFields({ name: "Words", value: formatNumber(book.wordCount), inline: true });

  if (book.qqScore && Number(book.qqScore) > 0) {
    embed.addFields({ name: "QQ Score", value: Number(book.qqScore).toFixed(1), inline: true });
  }

  if (book.stats) {
    const s = book.stats;
    if (s.communityScore > 0) {
      embed.addFields({ name: "Community Score", value: Number(s.communityScore).toFixed(1), inline: true });
    }
    embed.addFields({ name: "Ratings", value: formatNumber(s.totalRatings), inline: true });
    embed.addFields({ name: "Reviews", value: formatNumber(s.totalReviews), inline: true });
    embed.addFields({ name: "Bookmarks", value: formatNumber(s.totalBookmarks), inline: true });
    embed.addFields({ name: "Favorites", value: formatNumber(s.totalFavorites), inline: true });
  }

  const synopsis = book.synopsisTranslated || book.synopsis;
  if (synopsis) {
    embed.setDescription(truncate(synopsis, 300));
  }

  // Links: source + google search with raw title
  const links: string[] = [];
  if (book.url) links.push(`[Source](${book.url})`);
  if (book.title) links.push(`[Google](https://www.google.com/search?q=${encodeURIComponent(book.title)})`);
  links.push(`[DaoSearch](${bookUrl(book.id)})`);
  embed.addFields({ name: "Links", value: links.join(" · ") });

  embed.setFooter({ text: `ID: ${book.id}` });

  return embed;
}

export function searchEmbed(query: string, results: BookSummary[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`Search: "${truncate(query, 50)}"`)
    .setFooter({ text: `${results.length} result${results.length !== 1 ? "s" : ""}` });

  if (results.length === 0) {
    embed.setDescription("No books found.");
    return embed;
  }

  const lines = results.map((b, i) => {
    const title = displayTitle(b);
    const author = displayAuthor(b);
    const genre = b.genreNameTranslated || b.genreName;
    const parts = [genre].filter(Boolean);
    const meta = parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
    return `**${i + 1}.** [${truncate(title, 60)}](${bookUrl(b.id)}) by ${author}${meta}`;
  });

  const googleLink = `[Google Search](https://www.google.com/search?q=${encodeURIComponent(query)})`;
  lines.push(`\n${googleLink} — search for the raw title`);

  embed.setDescription(lines.join("\n"));
  return embed;
}

export function bookListEmbed(
  title: string,
  items: BookSummary[],
  page: number,
  totalPages: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(title)
    .setFooter({ text: `Page ${page}/${totalPages}` });

  if (items.length === 0) {
    embed.setDescription("No results.");
    return embed;
  }

  const lines = items.map((b, i) => {
    const rank = (page - 1) * 10 + i + 1;
    const title = displayTitle(b);
    const author = displayAuthor(b);
    const score = b.qqScore && Number(b.qqScore) > 0 ? ` · ⭐ ${Number(b.qqScore).toFixed(1)}` : "";
    return `**${rank}.** [${truncate(title, 50)}](${bookUrl(b.id)}) by ${author}\n　　${formatNumber(b.wordCount)} words${score}`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}

export function rankingEmbed(
  title: string,
  items: RankingItem[],
  page: number,
  totalPages: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(title)
    .setFooter({ text: `Page ${page}/${totalPages}` });

  if (items.length === 0) {
    embed.setDescription("No rankings available.");
    return embed;
  }

  const lines = items.map((item) => {
    const b = item.book;
    const title = displayTitle(b);
    const author = displayAuthor(b);
    const score = b.qqScore && Number(b.qqScore) > 0 ? ` · ⭐ ${Number(b.qqScore).toFixed(1)}` : "";
    return `**#${item.rank}** [${truncate(title, 50)}](${bookUrl(b.id)}) by ${author}\n　　${formatNumber(b.wordCount)} words${score}`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}

export function statsEmbed(stats: Stats): EmbedBuilder {
  const totalRatings = stats.community.ratingsGood + stats.community.ratingsNeutral + stats.community.ratingsBad;

  const qidianLines = [
    `**${formatNumber(stats.books.total)}** books (${formatNumber(stats.books.translated)} translated)`,
    `**${formatNumber(stats.chapters.total)}** chapters`,
    `**${formatNumber(stats.comments.total)}** comments (${formatNumber(stats.comments.translated)} translated)`,
    `**${formatNumber(stats.booklists.total)}** booklists (${formatNumber(stats.booklists.items)} items)`,
    `**${formatNumber(stats.rankings)}** ranking entries`,
    `**${formatNumber(stats.qqUsers.total)}** QQ users`,
  ];

  const communityLines = [
    `**${formatNumber(stats.community.users)}** users`,
    `**${formatNumber(stats.community.reviews)}** reviews`,
    `**${formatNumber(totalRatings)}** ratings`,
    `**${formatNumber(stats.community.bookmarks)}** bookmarks`,
    `**${formatNumber(stats.community.tags)}** tags (${formatNumber(stats.community.tagVotes)} votes)`,
  ];

  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle("DaoSearch Stats")
    .addFields(
      { name: "Qidian Data", value: qidianLines.join("\n") },
      { name: "Community", value: communityLines.join("\n") },
    )
    .setFooter({ text: "daosearch.io" });
}

export function genresEmbed(genres: Genre[]): EmbedBuilder {
  const lines = genres.map((g) => {
    const name = g.nameTranslated || g.name;
    return `[**${name}**](${SITE_URL}/library?genre=${g.id}&page=1)`;
  });

  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle("Genres")
    .setDescription(lines.join("\n") || "No genres found.")
    .setFooter({ text: `${genres.length} genres` });
}

function booklistUrl(id: number) {
  return `${SITE_URL}/qidian/booklists/${id}`;
}

export function booklistsEmbed(
  lists: Booklist[],
  page: number,
  totalPages: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle("Booklists")
    .setFooter({ text: `Page ${page}/${totalPages}` });

  if (lists.length === 0) {
    embed.setDescription("No booklists found.");
    return embed;
  }

  const lines = lists.map((bl, i) => {
    const rank = (page - 1) * 10 + i + 1;
    const title = bl.titleTranslated || bl.title;
    const followers = bl.followerCount ? ` · ${formatNumber(bl.followerCount)} followers` : "";
    return `**${rank}.** [${truncate(title, 60)}](${booklistUrl(bl.id)}) — ${bl.matchedBookCount || bl.bookCount} books${followers}`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}

export function opinionsEmbed(
  bookTitle: string,
  reviews: Review[],
  comments: Comment[],
  page: number,
  totalPages: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`Reviews: ${truncate(bookTitle, 80)}`)
    .setFooter({ text: `Page ${page}/${totalPages}` });

  const sections: string[] = [];

  if (reviews.length > 0) {
    const reviewLines = reviews.map((r) => {
      const ratingLabel = r.rating === 1 ? "👍" : r.rating === -1 ? "👎" : "😐";
      const likes = r.likeCount > 0 ? ` · ${formatNumber(r.likeCount)} likes` : "";
      return `> ${ratingLabel} **${r.userDisplayName}**${likes}\n> ${truncate(r.reviewText, 150)}`;
    });
    sections.push(`__**Community**__\n${reviewLines.join("\n\n")}`);
  }

  if (comments.length > 0) {
    const commentLines = comments.map((c) => {
      const content = c.contentTranslated || c.content;
      const name = c.qqUserNicknameTranslated || c.qqUserNickname || "Anonymous";
      const agrees = c.agreeCount > 0 ? ` · 👍 ${formatNumber(c.agreeCount)}` : "";
      return `> **${name}**${agrees}\n> ${truncate(content, 150)}`;
    });
    sections.push(`__**Qidian**__\n${commentLines.join("\n\n")}`);
  }

  if (sections.length === 0) {
    embed.setDescription("No reviews or comments found.");
    return embed;
  }

  embed.setDescription(sections.join("\n\n"));
  return embed;
}

export function similarEmbed(bookTitle: string, recs: BookSummary[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`Similar to: ${truncate(bookTitle, 80)}`);

  if (recs.length === 0) {
    embed.setDescription("No recommendations available.");
    return embed;
  }

  const lines = recs.map((b, i) => {
    const title = displayTitle(b);
    const author = displayAuthor(b);
    const score = b.qqScore && Number(b.qqScore) > 0 ? ` · ⭐ ${Number(b.qqScore).toFixed(1)}` : "";
    return `**${i + 1}.** [${truncate(title, 50)}](${bookUrl(b.id)}) by ${author}\n　　${formatNumber(b.wordCount)} words${score}`;
  });

  embed.setDescription(lines.join("\n"));
  embed.setFooter({ text: `${recs.length} recommendations` });
  return embed;
}

export function tagsEmbed(bookTitle: string, tags: Tag[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`Tags: ${truncate(bookTitle, 80)}`);

  if (tags.length === 0) {
    embed.setDescription("No tags found.");
    return embed;
  }

  const lines = tags.map((t) => {
    const name = t.nameTranslated || t.name;
    return `**${name}** — ${t.voteCount} votes`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(ERROR_COLOR)
    .setDescription(message);
}
