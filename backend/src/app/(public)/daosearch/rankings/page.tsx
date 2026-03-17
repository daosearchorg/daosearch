import type { Metadata } from "next";
export const revalidate = 300;
import { getCommunityRankings, getPrimaryGenres, type CommunityPeriod } from "@/lib/queries";
import { CommunityRankingFilters } from "./filters";
import { RankingsList } from "../../qidian/rankings/rankings-list";
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { RankingsSwitch } from "@/components/booklist/rankings-switch";

const PERIODS: CommunityPeriod[] = ["daily", "weekly", "monthly", "all-time"];

const PERIOD_LABELS: Record<CommunityPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  "all-time": "All Time",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const period = PERIODS.includes(params.period as CommunityPeriod)
    ? (params.period as CommunityPeriod)
    : "weekly";
  const periodLabel = PERIOD_LABELS[period];

  const title = `${periodLabel} Community Rankings — DaoSearch`;
  const description = `Discover the most-read web novels on DaoSearch — ${periodLabel.toLowerCase()} community rankings based on reader engagement and ratings.`;

  return {
    title,
    description,
    keywords: ["community rankings", `${periodLabel.toLowerCase()} rankings`, "most read web novels", "web novel rankings", "daosearch rankings", "reader engagement"],
    alternates: { canonical: "/daosearch/rankings" },
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

export default async function CommunityRankingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const period = PERIODS.includes(params.period as CommunityPeriod)
    ? (params.period as CommunityPeriod)
    : "weekly";
  const page = Math.max(1, Number(params.page) || 1);
  const genreId = typeof params.genre === "string" ? Number(params.genre) || undefined : undefined;

  const [{ items, totalPages }, primaryGenres] = await Promise.all([
    getCommunityRankings({ period, page, genreId }),
    getPrimaryGenres(),
  ]);

  const paginationParams: Record<string, string> = {};
  if (period !== "weekly") paginationParams.period = period;
  if (genreId) paginationParams.genre = String(genreId);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      <div className="flex flex-col items-center gap-4 sm:gap-5 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Rankings</h1>
        <RankingsSwitch />
        <CommunityRankingFilters period={period} primaryGenres={primaryGenres} genreId={genreId} />
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">
          No rankings available for this period yet.
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
