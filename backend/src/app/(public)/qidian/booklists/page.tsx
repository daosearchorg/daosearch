import type { Metadata } from "next";
import { notFound } from "next/navigation";
export const revalidate = 300;
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { getQidianBooklists, getQidianBooklistTagCloud, resolveTagsByDisplayName } from "@/lib/queries";
import {
  BOOKLIST_SORT_OPTIONS,
  BOOKLIST_UPDATED_WITHIN_VALUES,
  type BooklistSort,
} from "@/lib/constants";
import { BooklistFilters } from "@/components/booklist/booklist-filters";
import { BooklistsList } from "./booklists-list";

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
  // Default to "recent". When searching without an explicit sort, fall back
  // to "relevance" so name matches dominate the ordering.
  const sort: BooklistSort = sortValid ?? (hasSearch ? "relevance" : "recent");
  const order = str(params.order) === "asc" ? ("asc" as const) : ("desc" as const);

  const qtagRaw = str(params.qtag);
  const qidianTags = qtagRaw
    ? qtagRaw
        .split(",")
        .map((t) => decodeURIComponent(t).trim())
        .filter(Boolean)
        .slice(0, 20)
    : undefined;

  const minFollowers = num(params.minF);
  const maxFollowers = num(params.maxF);
  const minBookCount = num(params.minB);
  const maxBookCount = num(params.maxB);
  const withinRaw = num(params.within);
  const updatedWithin = withinRaw != null && BOOKLIST_UPDATED_WITHIN_VALUES.has(withinRaw) ? withinRaw : undefined;

  return { name, sort, order, qidianTags, minFollowers, maxFollowers, minBookCount, maxBookCount, updatedWithin };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const { sort } = parseFilters(params);

  const sortLabel = BOOKLIST_SORT_OPTIONS.find((o) => o.value === sort)?.label;
  const title = sort === "recent"
    ? "Qidian Booklists"
    : `Qidian Booklists — ${sortLabel}`;
  const description = "Search and filter Qidian-curated booklists by tag, follower count, book count, and recency.";

  return {
    title,
    description,
    alternates: { canonical: "/qidian/booklists" },
    openGraph: { title, description },
  };
}

export default async function QidianBooklistsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const rawPage = Math.max(1, Number(str(params.page)) || 1);
  if (rawPage > 200) notFound();
  const page = rawPage;

  const [{ items, total, totalPages }, qidianTagCloud] = await Promise.all([
    getQidianBooklists({ page, ...filters }),
    getQidianBooklistTagCloud(),
  ]);

  // Collect every tag name shown on this page (translated values preferred,
  // falling back to original tag strings) so each badge can deep-link to
  // /library?tag=<id> when a matching community tag exists.
  const allTagNames = items.flatMap((it) =>
    (it.tags ?? []).slice(0, 6).map((t, i) => (it.tagsTranslated?.[i] || t)),
  );
  const tagIdMap = allTagNames.length > 0 ? await resolveTagsByDisplayName(allTagNames) : new Map<string, number>();

  // Preserve non-default filters in pagination links.
  const paginationParams: Record<string, string> = {};
  if (filters.name) paginationParams.name = filters.name;
  if (filters.sort !== "recent" && filters.sort !== "relevance") paginationParams.sort = filters.sort;
  if (filters.order !== "desc") paginationParams.order = filters.order;
  if (filters.qidianTags?.length) {
    paginationParams.qtag = filters.qidianTags.map((t) => encodeURIComponent(t)).join(",");
  }
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
        source="qidian"
        initial={filters}
        qidianTagCloud={qidianTagCloud}
      />

      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">
          No booklists found matching your filters.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground text-center">
            {total.toLocaleString()} curated booklists indexed
          </p>
          <BooklistsList items={items} showPodium={page === 1} tagIdMap={tagIdMap} />
          <Pagination currentPage={page} totalPages={totalPages} searchParams={paginationParams} />
        </>
      )}
    </div>
  );
}
