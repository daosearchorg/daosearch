import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guide",
  description: "Learn how to use DaoSearch — search, track, and discover web novel raws.",
};

export default function GuidePage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Guide</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Everything DaoSearch has to offer
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Library</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          The library is your main way to browse and search books. Use the search bar to find
          novels by title or author, and filter results by genre, status, audience, word count, and
          more. Sort by latest updates, Qidian score, community bookmarks, or chapter count to find
          exactly what you&apos;re looking for.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Book Pages</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Every book has a detailed page with translated metadata, chapter list, Qidian reader comments,
          community reviews, and ratings. You&apos;ll also find recommendation cards for similar
          novels, community tags, and links to the original Qidian source.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Rankings</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Two ranking systems are available. Qidian rankings mirror the official trending, rising,
          free, finished, and all-time charts from book.qq.com, split by gender. Community rankings
          are driven by what DaoSearch users are actually reading — daily, weekly, monthly, and
          all-time leaderboards.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Booklists</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Browse curated booklists from Qidian or community-created lists from other users. You can
          create your own public lists, follow lists you like, and add curator comments. Booklists
          are a great way to share themed collections of novels.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Feed</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Stay up to date with two activity feeds. The Qidian feed shows the latest reader comments
          on books, sorted by time. The community feed surfaces recent activity from DaoSearch users
          — reviews, ratings, bookmarks, and reading progress updates.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Compare</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Compare two books side-by-side with stats, reader overlap, tags, and recommendations.
          Search for specific books, pick from popular titles, or hit the random button to discover
          unexpected pairings.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Bookmarks &amp; Reading Status</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Bookmark any book to save it to your collection. Set a reading status — currently reading,
          completed, plan to read, or dropped — to keep track of your progress. You can also add
          books to custom lists from the bookmark dialog.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Community Tags</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Users can add tags to novels and booklists to help with discovery. Vote on existing tags to
          surface the most relevant ones. Tags are displayed on book pages and can be used as filters
          in the library.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Notifications</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Get notified when books on your bookmarks receive new chapters, or when someone follows one
          of your public lists. Notifications appear in the bell icon in the navigation bar.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">RSS Feeds</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Three RSS feeds are available for use with your favorite reader:
        </p>
        <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1">
          <li><strong>/rss/books</strong> — newly added books</li>
          <li><strong>/rss/qidian</strong> — latest Qidian comments</li>
          <li><strong>/rss/community</strong> — community activity</li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Account</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Sign in with Google or Discord to access all community features. Your account page shows
          your bookmarks, reading history, reviews, ratings, and public lists. You can customize your
          username and avatar from the account settings.
        </p>
      </section>
    </div>
  );
}
