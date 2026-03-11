import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description: "See what's new on DaoSearch — latest updates and improvements.",
};

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.11.0",
    date: "March 12, 2026",
    changes: [
      "New homepage — hero search, stats bar, genre quick browse, trending carousels, top rated grid, booklists, community rankings, activity feed, recently updated, and developer features",
      "Varied layout system — carousels, numbered lists, cover grids, and stacked cards instead of uniform carousels",
      "Mobile-optimized homepage with responsive grids, hidden sections, and controlled element sizing",
      "SEO improvements — updated meta descriptions, Twitter summary_large_image cards, OG images for booklist detail pages",
      "Homepage data cached for 15 minutes with ISR for fast loads",
    ],
  },
  {
    version: "0.10.0",
    date: "March 11, 2026",
    changes: [
      "Added Discord bot with 9 slash commands — /book, /browse, /similar, /reviews, /rankings, /trending, /genres, /booklists, /stats",
      "Discord bot runs as standalone service calling the public API, with button pagination and rich embeds",
      "Added public REST API (v1) with 15 endpoints — books, search, rankings, genres, booklists, feed, stats, and more",
      "Added MCP server for Claude and other AI agents",
      "Added community rankings and book recommendations API endpoints",
      "Added limit parameter support for large API requests",
      "Updated Discord info page with bot features and invite link",
      "Allowed MCP and public API paths in robots.txt",
    ],
  },
  {
    version: "0.9.0",
    date: "March 11, 2026",
    changes: [
      "Added side-by-side book comparison with search, popular picks, and random button",
      "Added RSS feeds for new books, Qidian comments, and community activity",
      "Added security headers and API rate limiting",
      "Added guide page with full feature overview",
      "Switched translation engine from OpenAI to Google Translate",
      "Improved translation retry logic with per-field retries and residual text cleanup",
      "Fixed Qidian timestamp timezone bug causing negative \"updated ago\" values",
      "Fixed Qidian score showing red when score is 0",
      "Various library and ranking filter fixes",
    ],
  },
  {
    version: "0.7.0",
    date: "March 10, 2026",
    changes: [
      "Added community tags — tag novels and booklists, vote on tags, filter by tags in library",
      "Added reading status tracking — currently reading, completed, plan to read, dropped",
      "Added \"if you liked X, try Y\" recommendation cards on book pages",
      "Added notification system for new chapters and list follows",
      "Added public community booklists with follow, curator comments, and list ranking",
      "Added community activity feed — reviews, ratings, bookmarks, reading updates",
      "Added favicon and filled out footer pages (about, terms, privacy)",
      "Site-wide navigation improvements",
    ],
  },
  {
    version: "0.5.0",
    date: "March 9, 2026",
    changes: [
      "Redesigned ranking pages with podium layout and stat badges",
      "Redesigned feed page layout",
      "Redesigned booklists page with curator comments and detail pages",
      "Added individual Qidian booklist detail pages",
      "Added excluded content stats section",
      "Added community tag translation pipeline",
      "Improved site theme and overall visual consistency",
      "Booklist card sizing and mobile text size fixes",
    ],
  },
  {
    version: "0.3.2",
    date: "March 8, 2026",
    changes: [
      "Major scraper and worker performance optimizations",
      "Improved data validation and junk genre cleanup",
      "Added weekly discovery worker for finding new books",
      "Better booklist translation pipeline with batched curator comments",
      "Fixed various translation and pinyin validation bugs",
    ],
  },
  {
    version: "0.3.0",
    date: "March 7, 2026",
    changes: [
      "Added Qidian booklists scraping and ranking page",
      "Added community rankings based on reader activity — daily, weekly, monthly, all-time",
      "Added community feed page for user activity",
      "Added library search API with fuzzy matching",
      "Improved genre and subgenre filtering in library",
      "Improved stats page with better layout and queue table mobile scroll",
      "Standardized pagination to 50 items across the site",
      "Various filter and layout fixes",
    ],
  },
  {
    version: "0.2.0",
    date: "March 5, 2026",
    changes: [
      "Added book detail pages with ratings and reviews",
      "Added user profile and account pages — reviews, bookmarks, settings",
      "Added Qidian feed page showing latest reader comments",
      "Added book image upload pipeline to R2 storage",
      "Added SEO improvements — slugs, meta tags, structured data",
      "Added novel ranking page with Qidian stats",
      "Image optimization and site-wide caching",
      "Mobile drawer and dialog fixes",
    ],
  },
  {
    version: "0.1.0",
    date: "February 22, 2026",
    changes: [
      "Initial release — scraper, translation pipeline, and Next.js frontend",
      "Library page with browse and filter",
      "Qidian book scraping with proxy rotation and anti-blocking",
      "QQ comment scraping with sentiment analysis",
      "OpenAI-powered translation for titles, synopses, and comments",
      "Redis-backed task queues with scraper, translation, and maintenance workers",
      "Docker Compose setup for local, staging, and production",
      "Stats page with live database and queue statistics",
      "Google and Discord OAuth authentication",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Changelog</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Updates and improvements to DaoSearch
        </p>
      </div>

      <div className="flex flex-col gap-10 sm:gap-12">
        {CHANGELOG.map((entry) => (
          <section key={entry.version} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-base sm:text-lg font-medium">v{entry.version}</h2>
              <span className="text-xs sm:text-sm text-muted-foreground">{entry.date}</span>
            </div>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1.5">
              {entry.changes.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
