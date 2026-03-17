import type { Metadata } from "next";
export const revalidate = 300;
import { getRankings, getQidianRankingGenres } from "@/lib/queries";
import { GENDER_RANK_TYPES, RANK_TYPE_LABELS, RANK_TYPE_CYCLES, PUBLISH_RANK_TYPE_CYCLES, type Gender } from "@/lib/constants";
import { RankingFilters } from "./filters";
import { RankingsList } from "./rankings-list";
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { RankingsSwitch } from "@/components/booklist/rankings-switch";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const GENDER_LABELS: Record<string, string> = { male: "Male", female: "Female", publish: "Published" };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const gender = (typeof params.gender === "string" ? params.gender : "male") as Gender;
  const rankType = typeof params.type === "string" ? params.type : (GENDER_RANK_TYPES[gender]?.[0] ?? "popular");
  const cycleMap = gender === "publish" ? PUBLISH_RANK_TYPE_CYCLES : RANK_TYPE_CYCLES;
  const availableCycles = cycleMap[rankType] ?? ["cycle-1"];
  const defaultCycle = availableCycles[0];
  const cycle = typeof params.cycle === "string" && availableCycles.includes(params.cycle)
    ? params.cycle : defaultCycle;

  const genderLabel = GENDER_LABELS[gender] ?? "Male";
  const typeLabel = RANK_TYPE_LABELS[rankType] ?? rankType;
  const title = `${genderLabel} ${typeLabel} Rankings — Official Charts`;
  const description = `Browse the top ${typeLabel.toLowerCase()} ${genderLabel.toLowerCase()} web novels — updated daily. Discover trending, rising, and all-time favorites on DaoSearch.`;

  return {
    title,
    description,
    keywords: [`${genderLabel.toLowerCase()} web novels`, "web novel rankings", "chinese novel rankings", "web novel charts", "daosearch"],
    alternates: { canonical: "/qidian/rankings" },
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function RankingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const gender = (typeof params.gender === "string" ? params.gender : "male") as Gender;
  const rankType =
    typeof params.type === "string" ? params.type : (GENDER_RANK_TYPES[gender]?.[0] ?? "popular");
  const cycleMap = gender === "publish" ? PUBLISH_RANK_TYPE_CYCLES : RANK_TYPE_CYCLES;
  const availableCycles = cycleMap[rankType] ?? ["cycle-1"];
  const defaultCycle = availableCycles[0];
  const cycle = typeof params.cycle === "string" && availableCycles.includes(params.cycle)
    ? params.cycle
    : defaultCycle;
  const page = Math.max(1, Number(params.page) || 1);
  const genreId = typeof params.genre === "string" ? Number(params.genre) || undefined : undefined;

  const [{ items: rawItems, totalPages }, primaryGenres] = await Promise.all([
    getRankings({ gender, rankType, cycle, page, genreId }),
    getQidianRankingGenres(gender, rankType, cycle),
  ]);

  // Re-index positions when genre filter is applied
  const pageSize = 49;
  const items = genreId
    ? rawItems.map((item, i) => ({ ...item, position: (page - 1) * pageSize + i + 1 }))
    : rawItems;

  // Build searchParams for pagination links (preserve filters)
  const paginationParams: Record<string, string> = {};
  if (gender !== "male") paginationParams.gender = gender;
  if (rankType !== (GENDER_RANK_TYPES[gender]?.[0] ?? "popular")) paginationParams.type = rankType;
  if (cycle !== defaultCycle) paginationParams.cycle = cycle;
  if (genreId) paginationParams.genre = String(genreId);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      <div className="flex flex-col items-center gap-4 sm:gap-5 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Rankings</h1>
        <RankingsSwitch />
        <RankingFilters gender={gender} rankType={rankType} cycle={cycle} primaryGenres={primaryGenres} genreId={genreId} />
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">
          No rankings found for this combination.
        </p>
      ) : (
        <>
          <RankingsList items={items} showPodium={page === 1} />
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
