const BASE_URL = "https://daosearch.io";

interface RssChannel {
  title: string;
  description: string;
  link: string;
  items: RssItem[];
}

interface RssItem {
  title: string;
  link: string;
  description?: string;
  pubDate: Date | string;
  guid?: string;
  author?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRfc822(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toUTCString();
}

export function buildRss(channel: RssChannel): string {
  const itemsXml = channel.items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      ${item.description ? `<description>${escapeXml(item.description)}</description>` : ""}
      <pubDate>${formatRfc822(item.pubDate)}</pubDate>
      <guid>${escapeXml(item.guid ?? item.link)}</guid>
      ${item.author ? `<author>${escapeXml(item.author)}</author>` : ""}
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>en</language>
    <lastBuildDate>${formatRfc822(new Date())}</lastBuildDate>
    <atom:link href="${escapeXml(channel.link)}" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;
}

export function rssResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}

export { BASE_URL };
export type { RssItem };
