import type { Metadata } from "next";
import { getDbStats, getQueueStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stats",
  description: "Live database and queue statistics for DaoSearch — books, chapters, comments, and translation progress",
  alternates: { canonical: "/stats" },
  openGraph: {
    title: "Stats",
    description: "Live database and queue statistics for DaoSearch",
  },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default async function StatsPage() {
  const [dbStats, queueStats] = await Promise.all([
    getDbStats(),
    getQueueStats(),
  ]);

  const dbCards = [
    {
      label: "Books",
      total: dbStats.books.total,
      details: `${formatNumber(dbStats.books.scraped)} scraped, ${formatNumber(dbStats.books.translated)} translated`,
    },
    {
      label: "Chapters",
      total: dbStats.chapters.total,
      details: `${formatNumber(dbStats.chapters.translated)} translated`,
    },
    {
      label: "Comments",
      total: dbStats.comments.total,
      details: `${formatNumber(dbStats.comments.translated)} translated`,
    },
    {
      label: "Source Users",
      total: dbStats.qqUsers.total,
      details: `${formatNumber(dbStats.qqUsers.translated)} names translated`,
    },
    {
      label: "Ranking Entries",
      total: dbStats.rankings,
    },
    {
      label: "Booklists",
      total: dbStats.booklists.total,
      details: `${formatNumber(dbStats.booklists.translated)} translated, ${formatNumber(dbStats.booklists.items)} items`,
    },
  ];

  const communityCards = [
    {
      label: "Users",
      total: dbStats.community.users,
      details: `${formatNumber(dbStats.community.usersGoogle)} Google, ${formatNumber(dbStats.community.usersDiscord)} Discord`,
    },
    {
      label: "Reviews",
      total: dbStats.community.reviews,
      details: `${formatNumber(dbStats.community.reviewReplies)} replies`,
    },
    {
      label: "Ratings",
      total: dbStats.community.ratingsGood + dbStats.community.ratingsNeutral + dbStats.community.ratingsBad,
      details: `${formatNumber(dbStats.community.ratingsGood)} good, ${formatNumber(dbStats.community.ratingsNeutral)} neutral, ${formatNumber(dbStats.community.ratingsBad)} bad`,
    },
    {
      label: "Bookmarks",
      total: dbStats.community.bookmarks,
      details: [
        dbStats.community.bookmarksReading > 0 ? `${formatNumber(dbStats.community.bookmarksReading)} reading` : null,
        dbStats.community.bookmarksCompleted > 0 ? `${formatNumber(dbStats.community.bookmarksCompleted)} completed` : null,
        dbStats.community.bookmarksPlanToRead > 0 ? `${formatNumber(dbStats.community.bookmarksPlanToRead)} planned` : null,
        dbStats.community.bookmarksDropped > 0 ? `${formatNumber(dbStats.community.bookmarksDropped)} dropped` : null,
      ].filter(Boolean).join(", ") || undefined,
    },
    {
      label: "Booklists",
      total: dbStats.community.lists,
      details: `${formatNumber(dbStats.community.listItems)} items, ${formatNumber(dbStats.community.listFollows)} follows`,
    },
    {
      label: "Tags",
      total: dbStats.community.tags,
      details: `${formatNumber(dbStats.community.tagVotes)} votes`,
    },
  ];

  const excludedCards = [
    { label: "Genres", total: dbStats.blacklisted.genres },
    { label: "Books", total: dbStats.blacklisted.books },
  ];

  const totalPending = queueStats.reduce((s, q) => s + q.pending, 0);
  const totalStarted = queueStats.reduce((s, q) => s + q.started, 0);
  const totalFailed = queueStats.reduce((s, q) => s + q.failed, 0);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Stats</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Database and queue statistics
        </p>
      </div>

      {/* Source Data */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">
          Source Data
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {dbCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-1.5"
            >
              <span className="text-xs sm:text-sm text-muted-foreground">{card.label}</span>
              <span className="text-xl sm:text-2xl font-medium tabular-nums">
                {formatNumber(card.total)}
              </span>
              {card.details && (
                <span className="text-xs sm:text-sm text-muted-foreground">{card.details}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Community */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">
          Community
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {communityCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-1.5"
            >
              <span className="text-xs sm:text-sm text-muted-foreground">{card.label}</span>
              <span className="text-xl sm:text-2xl font-medium tabular-nums">
                {formatNumber(card.total)}
              </span>
              {card.details && (
                <span className="text-xs sm:text-sm text-muted-foreground">{card.details}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Excluded Content */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base sm:text-lg font-medium">
            Excluded Content
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Non-webnovel genres excluded from counts above. Spot something wrong? <a href="#" className="underline underline-offset-2 hover:text-foreground">Let us know</a>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {excludedCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-1.5"
            >
              <span className="text-xs sm:text-sm text-muted-foreground">{card.label}</span>
              <span className="text-xl sm:text-2xl font-medium tabular-nums">
                {formatNumber(card.total)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Queue Stats */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-medium">
            Queues
          </h2>
          {queueStats.length > 0 && (
            <span className="text-xs sm:text-sm text-muted-foreground">
              {totalPending} pending &middot; {totalStarted} running &middot; {totalFailed} failed
            </span>
          )}
        </div>

        {queueStats.length === 0 ? (
          <p className="text-sm sm:text-base text-muted-foreground py-8 text-center">
            Unable to connect to Redis
          </p>
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm sm:text-base min-w-[480px]">
              <thead>
                <tr className="border-b text-xs sm:text-sm text-muted-foreground">
                  <th className="text-left font-medium px-4 sm:px-5 py-3">Queue</th>
                  <th className="text-right font-medium px-4 sm:px-5 py-3">Pending</th>
                  <th className="text-right font-medium px-4 sm:px-5 py-3">Running</th>
                  <th className="text-right font-medium px-4 sm:px-5 py-3">Failed</th>
                </tr>
              </thead>
              <tbody>
                {queueStats.map((q) => (
                  <tr key={q.name} className="border-b last:border-0">
                    <td className="px-4 sm:px-5 py-3 font-mono text-xs sm:text-sm">{q.name}</td>
                    <td className="text-right px-4 sm:px-5 py-3 tabular-nums">
                      {q.pending > 0 ? (
                        <span className="text-yellow-600 dark:text-yellow-400">{q.pending.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="text-right px-4 sm:px-5 py-3 tabular-nums">
                      {q.started > 0 ? (
                        <span className="text-blue-600 dark:text-blue-400">{q.started.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="text-right px-4 sm:px-5 py-3 tabular-nums">
                      {q.failed > 0 ? (
                        <span className="text-red-600 dark:text-red-400">{q.failed.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
