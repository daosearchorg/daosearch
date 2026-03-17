import type { Metadata } from "next";
export const revalidate = 300;
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { getCommunityBooklists, type CommunityBooklistSort } from "@/lib/queries";
import { CommunityBooklistFilters } from "./filters";
import { CommunityBooklistsList } from "./booklists-list";
import { BooklistsSwitch } from "@/components/booklist/booklists-switch";

const SORTS: CommunityBooklistSort[] = ["popular", "recent", "largest"];

const SORT_META: Record<CommunityBooklistSort, { title: string; description: string }> = {
  popular: {
    title: "Community Booklists",
    description: "Browse user-created community booklists ranked by follower count.",
  },
  recent: {
    title: "Recently Updated Community Booklists",
    description: "Explore community booklists that were updated most recently.",
  },
  largest: {
    title: "Largest Community Booklists",
    description: "Find the biggest user-created community booklists by book count.",
  },
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const sort = SORTS.includes(params.sort as CommunityBooklistSort)
    ? (params.sort as CommunityBooklistSort)
    : "recent";

  const meta = SORT_META[sort];

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: "/daosearch/booklists" },
    openGraph: {
      title: meta.title,
      description: meta.description,
    },
  };
}

export default async function CommunityBooklistsPage({ searchParams }: Props) {
  const params = await searchParams;
  const sort = SORTS.includes(params.sort as CommunityBooklistSort)
    ? (params.sort as CommunityBooklistSort)
    : "recent";
  const page = Math.max(1, Number(params.page) || 1);

  const { items, total, totalPages } = await getCommunityBooklists({ page, sort });

  const paginationParams: Record<string, string> = {};
  if (sort !== "recent") paginationParams.sort = sort;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      <div className="flex flex-col items-center gap-4 sm:gap-5 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Booklists</h1>
        <BooklistsSwitch />
        <CommunityBooklistFilters sort={sort} />
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">
          No booklists found yet.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground text-center">
            {total.toLocaleString()} community booklists
          </p>
          <CommunityBooklistsList items={items} showPodium={page === 1} />
          <Pagination currentPage={page} totalPages={totalPages} searchParams={paginationParams} />
        </>
      )}
    </div>
  );
}
