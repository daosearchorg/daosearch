import type { Metadata } from "next";
export const revalidate = 300;
import { Pagination } from "@/components/pagination";
import { ScrollToTop } from "@/components/scroll-to-top";
import { getQidianBooklists, type QidianBooklistSort } from "@/lib/queries";
import { BooklistFilters } from "./filters";
import { BooklistsList } from "./booklists-list";
import { BooklistsSwitch } from "@/components/booklists-switch";

const SORTS: QidianBooklistSort[] = ["popular", "recent", "largest"];

const SORT_META: Record<QidianBooklistSort, { title: string; description: string }> = {
  popular: {
    title: "Official Booklists",
    description: "Browse curated booklists ranked by follower count, with DaoSearch-linked books surfaced inline.",
  },
  recent: {
    title: "Recently Updated Booklists",
    description: "Explore booklists that were updated most recently, with linked DaoSearch books previewed on each list.",
  },
  largest: {
    title: "Largest Official Booklists",
    description: "Find the biggest curated booklists by book count and jump straight into the DaoSearch-linked titles inside them.",
  },
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const sort = SORTS.includes(params.sort as QidianBooklistSort)
    ? (params.sort as QidianBooklistSort)
    : "recent";

  const meta = SORT_META[sort];

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: "/qidian/booklists" },
    openGraph: {
      title: meta.title,
      description: meta.description,
    },
  };
}

export default async function QidianBooklistsPage({ searchParams }: Props) {
  const params = await searchParams;
  const sort = SORTS.includes(params.sort as QidianBooklistSort)
    ? (params.sort as QidianBooklistSort)
    : "recent";
  const page = Math.max(1, Number(params.page) || 1);

  const { items, total, totalPages } = await getQidianBooklists({ page, sort });

  const paginationParams: Record<string, string> = {};
  if (sort !== "recent") paginationParams.sort = sort;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      <div className="flex flex-col items-center gap-4 sm:gap-5 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Booklists</h1>
        <BooklistsSwitch />
        <BooklistFilters sort={sort} />
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">
          No booklists found yet.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground text-center">
            {total.toLocaleString()} curated booklists indexed
          </p>
          <BooklistsList items={items} showPodium={page === 1} />
          <Pagination currentPage={page} totalPages={totalPages} searchParams={paginationParams} />
        </>
      )}
    </div>
  );
}
