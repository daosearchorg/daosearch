import type { Metadata } from "next";
import { getLatestQidianComments } from "@/lib/queries";
import { FeedList } from "./feed-list";
import { FeedSwitch } from "@/components/booklist/feed-switch";
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Official Feed",
  description: "Latest comments from readers on web novels — browse what the community is saying.",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function QidianFeedPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const { items, total, totalPages } = await getLatestQidianComments(page);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      <div className="flex flex-col items-center gap-4 sm:gap-5 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Feed</h1>
        <FeedSwitch />
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">No comments found.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground text-center">
            {total.toLocaleString()} comments indexed
          </p>
          <FeedList items={items} />
          <Pagination currentPage={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
