import type { Metadata } from "next";
import { getDaoSearchFeed } from "@/lib/queries";
import { DaoSearchFeedList } from "./feed-list";
import { FeedSwitch } from "@/components/booklist/feed-switch";
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "DaoSearch Feed",
  description: "Latest activity from DaoSearch readers — ratings, reviews, bookmarks, and reading updates.",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DaoSearchFeedPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const { items, total, totalPages } = await getDaoSearchFeed(page);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      <div className="flex flex-col items-center gap-4 sm:gap-5 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Feed</h1>
        <FeedSwitch />
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">No activity yet.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground text-center">
            {total.toLocaleString()} activities indexed
          </p>
          <DaoSearchFeedList items={items} />
          <Pagination currentPage={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
