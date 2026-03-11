import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollText, MessageSquareText, Star, Users } from "lucide-react";
import { bookUrl } from "@/lib/utils";

const POSITION_COLORS: Record<number, string> = {
  1: "text-amber-500",
  2: "text-zinc-400",
  3: "text-amber-700",
};

const HERO_BORDER_COLORS: Record<number, string> = {
  1: "border-l-amber-500",
  2: "border-l-zinc-400",
  3: "border-l-amber-700",
};

const PODIUM_BADGE_COLORS: Record<number, string> = {
  1: "bg-gradient-to-br from-amber-300 to-amber-500 text-white",
  2: "bg-gradient-to-br from-zinc-300 to-zinc-400 text-white",
  3: "bg-gradient-to-br from-amber-500 to-amber-700 text-white",
};

const LIST_TOP3_BG: Record<number, string> = {
  1: "bg-gradient-to-r from-amber-500/8 to-transparent",
  2: "bg-gradient-to-r from-zinc-500/8 to-transparent",
  3: "bg-gradient-to-r from-orange-500/8 to-transparent",
};

interface BookCardStats {
  wordCount?: number | null;
  commentCount?: number | null;
  ratingCount?: number | null;
  ratingPositive?: number | null;
  ratingNeutral?: number | null;
  ratingNegative?: number | null;
  reviewCount?: number | null;
  readerCount?: number | null;
  qqScore?: string | null;
}

interface BookCardProps {
  position?: number;
  title: string | null;
  titleOriginal: string | null;
  author: string | null;
  authorOriginal: string | null;
  imageUrl: string | null;
  genreName: string | null;
  synopsis?: string | null;
  bookId: number;
  variant?: "list" | "grid" | "hero" | "podium";
  stats?: BookCardStats;
  disablePodium?: boolean;
}

function formatWordCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return count.toString();
}

function qqScoreColor(score: string): string {
  const n = parseFloat(score);
  if (n === 0) return "";
  if (n >= 8) return "!text-green-600 dark:!text-green-500";
  if (n >= 5) return "!text-amber-500";
  return "!text-red-500";
}

function getDominantScore(stats: BookCardStats): { pct: number; color: string } | null {
  if ((stats.ratingCount ?? 0) === 0) return null;
  const good = stats.ratingPositive ?? 0;
  const neutral = stats.ratingNeutral ?? 0;
  const bad = stats.ratingNegative ?? 0;
  const total = stats.ratingCount!;

  const goodPct = Math.round((good / total) * 100);
  const neutralPct = Math.round((neutral / total) * 100);
  const badPct = Math.round((bad / total) * 100);

  if (goodPct >= neutralPct && goodPct >= badPct) {
    return { pct: goodPct, color: "text-green-600 dark:text-green-500" };
  }
  if (neutralPct >= badPct) {
    return { pct: neutralPct, color: "text-amber-500" };
  }
  return { pct: badPct, color: "text-red-500" };
}

function StatRow({ stats, className }: { stats: BookCardStats; className?: string }) {
  const score = getDominantScore(stats);
  const combinedReviews = (stats.commentCount ?? 0) + (stats.reviewCount ?? 0);
  const hasAny = (stats.wordCount ?? 0) > 0 || stats.qqScore || combinedReviews > 0 || score != null;
  if (!hasAny) return null;

  return (
    <div className={`flex items-center gap-3 text-sm text-muted-foreground ${className ?? ""}`}>
      {(stats.wordCount ?? 0) > 0 && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <ScrollText className="size-3.5 shrink-0" />
          <span className="font-medium tabular-nums">{formatWordCount(stats.wordCount!)}</span>
        </span>
      )}
      {stats.qqScore && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Star className="size-3.5 shrink-0" />
          <span className={`font-medium tabular-nums ${qqScoreColor(stats.qqScore)}`}>{stats.qqScore}</span>
        </span>
      )}
      {combinedReviews > 0 && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <MessageSquareText className="size-3.5 shrink-0" />
          <span className="font-medium tabular-nums">{combinedReviews.toLocaleString()}</span>
        </span>
      )}
      {score != null && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Users className="size-3.5 shrink-0" />
          <span className={`font-medium tabular-nums ${score.color}`}>
            {score.pct}%
          </span>
        </span>
      )}
    </div>
  );
}

export function BookCard({
  position,
  title,
  titleOriginal,
  author,
  authorOriginal,
  imageUrl,
  genreName,
  synopsis,
  bookId,
  variant = "list",
  stats,
  disablePodium,
}: BookCardProps) {
  const cleanSynopsis = synopsis?.replace(/\\n/g, " ").replace(/\n/g, " ").trim() || null;
  const displayTitle = title || titleOriginal || "Untitled";
  const displayAuthor = author || authorOriginal || "Unknown";

  if (variant === "podium") {
    const badgeColor = position ? PODIUM_BADGE_COLORS[position] ?? "bg-muted text-muted-foreground" : "";
    const isFirst = position === 1;
    const podiumBgMap: Record<number, string> = {
      1: "bg-gradient-to-r from-amber-500/8 to-transparent",
      2: "bg-gradient-to-r from-zinc-500/8 to-transparent",
      3: "bg-gradient-to-r from-orange-500/8 to-transparent",
    };
    const podiumBg = position ? podiumBgMap[position] ?? "" : "";

    return (
      <Link href={bookUrl(bookId, title)} className="group block">
        <Card className="border-0 shadow-none bg-transparent gap-0 p-0">
          <div className={`flex flex-col items-center text-center h-full rounded-xl p-4 ${podiumBg}`}>
            <div className="relative">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={displayTitle}
                  width={isFirst ? 180 : 140}
                  height={isFirst ? 240 : 187}
                  className={`rounded-xl object-cover shadow-md transition-transform duration-300 group-hover:scale-[1.03] ${
                    isFirst
                      ? "w-[180px] h-[240px]"
                      : "w-[140px] h-[187px]"
                  }`}
                />
              ) : (
                <div
                  className={`flex items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground ${
                    isFirst ? "w-[180px] h-[240px]" : "w-[140px] h-[187px]"
                  }`}
                >
                  No image
                </div>
              )}
              {position != null && (
                <span className={`absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shadow-lg ring-2 ring-background ${badgeColor}`}>
                  {position}
                </span>
              )}
            </div>
            <div className="mt-6 min-w-0 w-full px-1">
              <p className={`font-medium line-clamp-2 ${isFirst ? "text-lg" : "text-base"}`}>
                {displayTitle}
              </p>
              {title && titleOriginal ? (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{titleOriginal}</p>
              ) : (
                <p className="text-xs mt-1 invisible">placeholder</p>
              )}
              <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{displayAuthor}</p>
              {genreName && (
                <Badge variant="secondary" className="mt-2 mx-auto">
                  {genreName}
                </Badge>
              )}
              {stats && <StatRow stats={stats} className="justify-center mt-2 text-xs" />}
            </div>
            {cleanSynopsis && (
              <p className="text-sm leading-relaxed mt-4 px-2 line-clamp-3 text-center text-muted-foreground">
                {cleanSynopsis.length > 250 ? cleanSynopsis.slice(0, 250) + "..." : cleanSynopsis}
              </p>
            )}
          </div>
        </Card>
      </Link>
    );
  }

  if (variant === "hero") {
    const borderColor = position ? HERO_BORDER_COLORS[position] ?? "" : "";
    const posColor = position ? POSITION_COLORS[position] ?? "text-muted-foreground" : "";

    return (
      <Link href={bookUrl(bookId, title)} className="block">
        <div
          className={`flex items-start gap-4 sm:gap-5 rounded-xl border border-l-[3px] ${borderColor} p-4 sm:p-5 transition-colors hover:bg-accent/50`}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={displayTitle}
              width={120}
              height={160}
              className="shrink-0 rounded-lg object-cover w-[90px] h-[120px] sm:w-[120px] sm:h-[160px]"
            />
          ) : (
            <div className="flex shrink-0 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground w-[90px] h-[120px] sm:w-[120px] sm:h-[160px]">
              No image
            </div>
          )}
          <div className="min-w-0 flex-1 py-1">
            <div className="flex items-center gap-2 mb-1">
              {position != null && (
                <span className={`text-xl font-medium ${posColor}`}>#{position}</span>
              )}
            </div>
            <p className="font-medium text-base sm:text-lg">{displayTitle}</p>
            {title && titleOriginal && (
              <p className="text-sm text-muted-foreground mt-0.5">{titleOriginal}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">{displayAuthor}</p>
            {genreName && (
              <Badge variant="secondary" className="mt-2">
                {genreName}
              </Badge>
            )}
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "list") {
    const isTop3 = !disablePodium && position != null && position <= 3;
    const topBg = isTop3 && position ? LIST_TOP3_BG[position] ?? "" : "";
    const score = stats ? getDominantScore(stats) : null;
    const combinedReviews = stats ? (stats.commentCount ?? 0) + (stats.reviewCount ?? 0) : 0;
    const hasStats = stats && ((stats.wordCount ?? 0) > 0 || stats.qqScore || combinedReviews > 0 || score != null);

    return (
      <Link href={bookUrl(bookId, title)} className="block">
        <div className={`flex flex-col py-4 sm:py-5 px-2 sm:px-4 transition-colors hover:bg-accent/50 rounded-xl ${topBg}`}>
          <div className="flex items-start gap-3.5 sm:gap-5">
            {isTop3 && position && (
              <span className={`hidden sm:flex items-center justify-center w-8 h-8 shrink-0 rounded-full text-sm font-medium shadow-sm ring-1 ring-white/80 ${PODIUM_BADGE_COLORS[position] ?? ""}`}>
                {position}
              </span>
            )}
            <div className="relative shrink-0">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={displayTitle}
                  width={80}
                  height={106}
                  className="shrink-0 rounded-lg object-cover w-16 h-[85px] sm:w-[80px] sm:h-[106px]"
                />
              ) : (
                <div className="flex w-16 h-[85px] sm:w-[80px] sm:h-[106px] shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                  No img
                </div>
              )}
              {position != null && !isTop3 && (
                <span className="absolute -top-1.5 -left-1.5 flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-md text-[10px] font-medium bg-foreground/80 text-background">
                  {position}
                </span>
              )}
              {position != null && isTop3 && (
                <span className={`sm:hidden absolute -top-1.5 -left-1.5 flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-md text-[10px] font-medium ${
                  PODIUM_BADGE_COLORS[position] ?? "bg-foreground/80 text-background"
                }`}>
                  {position}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm sm:text-lg font-medium leading-tight line-clamp-2 sm:truncate sm:line-clamp-none">{displayTitle}</p>
                {genreName && (
                  <Badge variant="secondary" className="shrink-0 text-xs sm:hidden mt-0.5">
                    {genreName}
                  </Badge>
                )}
              </div>
              {title && titleOriginal && (
                <p className="hidden sm:block truncate text-sm text-muted-foreground mt-0.5">{titleOriginal}</p>
              )}
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">{displayAuthor}</p>
              {hasStats ? (
                <div className="flex sm:hidden items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                  {(stats.wordCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <ScrollText className="size-3 shrink-0" />
                      <span className="font-medium tabular-nums">{formatWordCount(stats.wordCount!)}</span>
                    </span>
                  )}
                  {stats.qqScore && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Star className="size-3 shrink-0" />
                      <span className={`font-medium tabular-nums ${qqScoreColor(stats.qqScore)}`}>{stats.qqScore}</span>
                    </span>
                  )}
                  {combinedReviews > 0 && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <MessageSquareText className="size-3 shrink-0" />
                      <span className="font-medium tabular-nums">{combinedReviews.toLocaleString()}</span>
                    </span>
                  )}
                  {score != null && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Users className="size-3 shrink-0" />
                      <span className={`font-medium tabular-nums ${score.color}`}>
                        {score.pct}%
                      </span>
                    </span>
                  )}
                </div>
              ) : null}
              {cleanSynopsis && (
                <p className="hidden sm:block text-sm leading-relaxed mt-2 line-clamp-3 overflow-hidden text-muted-foreground">
                  {cleanSynopsis.length > 400 ? cleanSynopsis.slice(0, 400) + "..." : cleanSynopsis}
                </p>
              )}
            </div>
            <div className="hidden sm:flex flex-col items-end gap-2 shrink-0 text-right">
              {genreName && (
                <Badge variant="secondary">
                  {genreName}
                </Badge>
              )}
              {hasStats && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {(stats.wordCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <ScrollText className="size-3.5 shrink-0" />
                      <span className="font-medium tabular-nums">{formatWordCount(stats.wordCount!)}</span>
                    </span>
                  )}
                  {stats.qqScore && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Star className="size-3.5 shrink-0" />
                      <span className={`font-medium tabular-nums ${qqScoreColor(stats.qqScore)}`}>{stats.qqScore}</span>
                    </span>
                  )}
                  {combinedReviews > 0 && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <MessageSquareText className="size-3.5 shrink-0" />
                      <span className="font-medium tabular-nums">{combinedReviews.toLocaleString()}</span>
                    </span>
                  )}
                  {score != null && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Users className="size-3.5 shrink-0" />
                      <span className={`font-medium tabular-nums ${score.color}`}>
                        {score.pct}%
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {cleanSynopsis && (
            <p className="sm:hidden text-xs leading-relaxed mt-1.5 px-0.5 line-clamp-3 overflow-hidden text-muted-foreground">
              {cleanSynopsis.length > 300 ? cleanSynopsis.slice(0, 300) + "..." : cleanSynopsis}
            </p>
          )}
        </div>
      </Link>
    );
  }

  // Grid variant
  return (
    <Link href={bookUrl(bookId, title)} className="block">
      <Card className="overflow-hidden transition-colors hover:bg-accent/50 gap-0 p-0">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={displayTitle}
            width={200}
            height={267}
            className="h-52 w-full object-cover"
          />
        ) : (
          <div className="flex h-52 w-full items-center justify-center bg-muted text-sm text-muted-foreground">
            No image
          </div>
        )}
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <p className="line-clamp-2 text-base font-medium">{displayTitle}</p>
          {title && titleOriginal && (
            <p className="line-clamp-1 text-sm text-muted-foreground">{titleOriginal}</p>
          )}
          <p className="text-sm text-muted-foreground">{displayAuthor}</p>
          {genreName && (
            <Badge variant="secondary" className="mt-auto w-fit">
              {genreName}
            </Badge>
          )}
        </div>
      </Card>
    </Link>
  );
}
