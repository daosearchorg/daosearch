import type { Metadata } from "next";
import { notFound } from "next/navigation";
export const revalidate = 300;
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { getCommunityBooklists, getPopularTags } from "@/lib/queries";
import {
  BOOKLIST_SORT_OPTIONS,
  BOOKLIST_UPDATED_WITHIN_VALUES,
  type BooklistSort,
} from "@/lib/constants";
import { BooklistFilters } from "@/components/booklist/booklist-filters";
import { CommunityBooklistsList } from "./booklists-list";

const VALID_SORTS = new Set<BooklistSort>(BOOKLIST_SORT_OPTIONS.map((o) => o.value));

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: string | string[] | undefined): number | undefined {
  const n = Number(str(v));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseFilters(params: Record<string, string | string[] | undefined>) {
  const name = str(params.name)?.trim() || undefined;
  const hasSearch = !!name;

  const sortRaw = str(params.sort) as BooklistSort | undefined;
  const sortValid = sortRaw && VALID_SORTS.has(sortRaw) ? sortRaw : undefined;
  const sort: BooklistSort = sortValid ?? (hasSearch ? "relevance" : "recent");
  const order = str(params.order) === "asc" ? ("asc" as const) : ("desc" as const);

  const tagRaw = str(params.tag);
  const tagIds = tagRaw
    ? tagRaw.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 20)
    : undefined;

  const minFollowers = num(params.minF);
  const maxFollowers = num(params.maxF);
  const minBookCount = num(params.minB);
  const maxBookCount = num(params.maxB);
  const withinRaw = num(params.within);
  const updatedWithin = withinRaw != null && BOOKLIST_UPDATED_WITHIN_VALUES.has(withinRaw) ? withinRaw : undefined;

  return { name, sort, order, tagIds, minFollowers, maxFollowers, minBookCount, maxBookCount, updatedWithin };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const { sort } = parseFilters(params);

  const sortLabel = BOOKLIST_SORT_OPTIONS.find((o) => o.value === sort)?.label;
  const title = sort === "recent"
    ? "Community Booklists"
    : `Community Booklists — ${sortLabel}`;
  const description = "Search and filter user-created community booklists by tag, follower count, book count, and recency.";

  return {
    title,
    description,
    alternates: { canonical: "/daosearch/booklists" },
    openGraph: { title, description },
  };
}

export default async function CommunityBooklistsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const rawPage = Math.max(1, Number(str(params.page)) || 1);
  if (rawPage > 200) notFound();
  const page = rawPage;

  const [{ items, total, totalPages }, popularTags] = await Promise.all([
    getCommunityBooklists({ page, ...filters }),
    getPopularTags(),
  ]);

  const paginationParams: Record<string, string> = {};
  if (filters.name) paginationParams.name = filters.name;
  if (filters.sort !== "recent" && filters.sort !== "relevance") paginationParams.sort = filters.sort;
  if (filters.order !== "desc") paginationParams.order = filters.order;
  if (filters.tagIds?.length) paginationParams.tag = filters.tagIds.join(",");
  if (filters.minFollowers != null) paginationParams.minF = String(filters.minFollowers);
  if (filters.maxFollowers != null) paginationParams.maxF = String(filters.maxFollowers);
  if (filters.minBookCount != null) paginationParams.minB = String(filters.minBookCount);
  if (filters.maxBookCount != null) paginationParams.maxB = String(filters.maxBookCount);
  if (filters.updatedWithin != null) paginationParams.within = String(filters.updatedWithin);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Booklists</h1>
        <p className="text-muted-foreground">
          Browse and search booklists
        </p>
      </div>

      <BooklistFilters
        source="community"
        initial={filters}
        popularTags={popularTags}
      />

      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">
          No booklists found matching your filters.
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
