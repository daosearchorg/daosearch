import type { Metadata } from "next";
export const revalidate = 300;
import { getQidianRankings } from "@/lib/queries";
import {
  QIDIAN_RANK_TYPES,
  QIDIAN_RANK_TYPE_LABELS,
  QIDIAN_GENRE_CHANNELS,
  QIDIAN_DEFAULT_RANK_TYPE,
  QIDIAN_DEFAULT_GENRE_CHANNEL,
  type QidianRankType,
  type QidianGenreChannel,
} from "@/lib/constants";
import { RankingFilters } from "./filters";
import { RankingsList } from "@/components/rankings/rankings-list";
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { RankingsSwitch } from "@/components/booklist/rankings-switch";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveParams(params: Record<string, string | string[] | undefined>) {
  const rankType = (typeof params.type === "string"
    && (QIDIAN_RANK_TYPES as readonly string[]).includes(params.type)
    ? params.type
    : QIDIAN_DEFAULT_RANK_TYPE) as QidianRankType;
  const genreChannel = (typeof params.genre === "string"
    && (QIDIAN_GENRE_CHANNELS as readonly string[]).includes(params.genre)
    ? params.genre
    : QIDIAN_DEFAULT_GENRE_CHANNEL) as QidianGenreChannel;
  const page = Math.max(1, Number(params.page) || 1);
  return { rankType, genreChannel, page };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { rankType } = resolveParams(await searchParams);
  const typeLabel = QIDIAN_RANK_TYPE_LABELS[rankType];
  const title = `Qidian ${typeLabel} Rankings — DaoSearch`;
  const description = `Browse Qidian.com ${typeLabel.toLowerCase()} leaderboards — top Chinese web novels, updated regularly on DaoSearch.`;

  return {
    title,
    description,
    keywords: ["qidian rankings", "qidian charts", "web novel rankings", "chinese novel charts", "daosearch"],
    alternates: { canonical: "/qidian/rankings" },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function QidianRankingsPage({ searchParams }: Props) {
  const { rankType, genreChannel, page } = resolveParams(await searchParams);

  const { items, totalPages } = await getQidianRankings({ rankType, genreChannel, page });

  // Preserve non-default filters in pagination links
  const paginationParams: Record<string, string> = {};
  if (rankType !== QIDIAN_DEFAULT_RANK_TYPE) paginationParams.type = rankType;
  if (genreChannel !== QIDIAN_DEFAULT_GENRE_CHANNEL) paginationParams.genre = genreChannel;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      <div className="flex flex-col items-center gap-4 sm:gap-5 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Rankings</h1>
        <RankingsSwitch />
        <RankingFilters rankType={rankType} genreChannel={genreChannel} />
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
