import type { Metadata } from "next";
import { notFound } from "next/navigation";
export const revalidate = 60;
import { getLibraryBooks, getPrimaryGenres, getSubgenres, getGenreSubgenrePairs, getPopularTags } from "@/lib/queries";
import { LIBRARY_SORT_OPTIONS, POPULARITY_PERIOD_OPTIONS } from "@/lib/constants";
import type { LibrarySort, PopularityPeriod } from "@/lib/constants";
import { LibraryFilters } from "./filters";
import { LibraryList } from "./library-list";
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const validSorts = new Set(LIBRARY_SORT_OPTIONS.map((s) => s.value));
const validPeriods = new Set(POPULARITY_PERIOD_OPTIONS.map((p) => p.value));

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: string | string[] | undefined): number | undefined {
  const n = Number(str(v));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export const metadata: Metadata = {
  title: "Library",
  description: "Browse and search web novels — filter by genre, word count, rating, and more.",
};

export default async function LibraryPage({ searchParams }: Props) {
  const params = await searchParams;

  const name = str(params.name)?.trim() || undefined;
  const author = str(params.author)?.trim() || undefined;
  const exactMatch = str(params.exact) === "1";
  const genreId = num(params.genre);
  const subgenreId = num(params.subgenre);
  const minWords = num(params.minWords);
  const maxWords = num(params.maxWords);
  const status = str(params.status) || undefined;
  const gender = str(params.gender) || undefined;
  const updatedWithin = num(params.updatedWithin);
  const olderThan = updatedWithin ? undefined : num(params.olderThan);
  const hasSearch = !!(name || author);
  const sortRaw = str(params.sort);
  // "relevance" is a hidden sort auto-applied when searching without an explicit sort
  const sort = (sortRaw && (validSorts.has(sortRaw as LibrarySort) || sortRaw === "relevance") ? sortRaw
    : hasSearch ? "relevance" : "updated") as LibrarySort | "relevance";
  const periodRaw = str(params.popularityPeriod);
  const popularityPeriod = (periodRaw && validPeriods.has(periodRaw as PopularityPeriod) ? periodRaw : "weekly") as PopularityPeriod;
  const order = str(params.order) === "asc" ? "asc" as const : "desc" as const;
  const rawPage = Math.max(1, Number(str(params.page)) || 1);
  if (rawPage > 200) notFound();
  const page = rawPage;

  // Parse book IDs
  const idsRaw = str(params.ids);
  const bookIds = idsRaw
    ? idsRaw.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 100)
    : undefined;

  // Parse tag IDs
  const tagsRaw = str(params.tag);
  const tagIds = tagsRaw
    ? tagsRaw.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : undefined;

  const [{ items, total, totalPages }, primaryGenres, subgenresList, genrePairs, popularTags] = await Promise.all([
    getLibraryBooks({
      name, author, exactMatch, genreId, subgenreId, bookIds,
      minWords, maxWords, status, gender,
      updatedWithin, olderThan, tagIds,
      sort, popularityPeriod, order, page,
    }),
    getPrimaryGenres(),
    getSubgenres(),
    getGenreSubgenrePairs(),
    getPopularTags(),
  ]);

  // Build pagination params (preserve non-default filters)
  const paginationParams: Record<string, string> = {};
  if (name) paginationParams.name = name;
  if (author) paginationParams.author = author;
  if (exactMatch) paginationParams.exact = "1";
  if (genreId) paginationParams.genre = String(genreId);
  if (subgenreId) paginationParams.subgenre = String(subgenreId);
  if (bookIds && bookIds.length > 0) paginationParams.ids = bookIds.join(",");
  if (minWords != null) paginationParams.minWords = String(minWords);
  if (maxWords != null) paginationParams.maxWords = String(maxWords);
  if (status) paginationParams.status = status;
  if (gender) paginationParams.gender = gender;
  if (updatedWithin) paginationParams.updatedWithin = String(updatedWithin);
  if (olderThan) paginationParams.olderThan = String(olderThan);
  if (sort !== "updated" && sort !== "relevance") paginationParams.sort = sort;
  if (sort === "popularity" && popularityPeriod !== "weekly") paginationParams.popularityPeriod = popularityPeriod;
  if (order !== "desc") paginationParams.order = order;
  if (tagIds && tagIds.length > 0) paginationParams.tag = tagIds.join(",");

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Library</h1>
        <p className="text-muted-foreground">
          Browse and search novels
        </p>
      </div>

      <LibraryFilters primaryGenres={primaryGenres} subgenres={subgenresList} genrePairs={genrePairs} popularTags={popularTags} />

      <p className="text-sm text-muted-foreground text-center">
        {total.toLocaleString()} novel{total !== 1 ? "s" : ""} found
      </p>

      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">
          No novels found matching your filters.
        </p>
      ) : (
        <>
          <LibraryList items={items} />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            searchParams={paginationParams}
          />
        </>
      )}
    </div>
  );
}
