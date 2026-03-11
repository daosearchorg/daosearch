"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCallback, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { CommunityPeriod } from "@/lib/queries";

const PERIODS: CommunityPeriod[] = ["daily", "weekly", "monthly", "all-time"];

const PERIOD_LABELS: Record<CommunityPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  "all-time": "All Time",
};

interface Genre {
  id: number;
  name: string;
  nameTranslated: string | null;
}

interface CommunityRankingFiltersProps {
  period: CommunityPeriod;
  primaryGenres: Genre[];
  genreId?: number;
}

export function CommunityRankingFilters({ period, primaryGenres, genreId }: CommunityRankingFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const setParams = useCallback(
    (updates: Record<string, string>, remove?: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        params.set(k, v);
      }
      if (remove) {
        for (const k of remove) params.delete(k);
      }
      params.set("page", "1");
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 w-full">
      {/* Period pills */}
      <div className="flex flex-wrap items-center justify-center gap-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => {
              if (p === "weekly") {
                setParams({}, ["period"]);
              } else {
                setParams({ period: p });
              }
            }}
            className={cn(
              "rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-sm font-medium transition-colors",
              period === p
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Genre filter */}
      <Select
        value={genreId ? String(genreId) : "all"}
        onValueChange={(v) => {
          if (v === "all") {
            setParams({}, ["genre"]);
          } else {
            setParams({ genre: v });
          }
        }}
      >
        <SelectTrigger className="h-9 w-auto min-w-[10rem]">
          <SelectValue placeholder="All genres" />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-60">
          <SelectItem value="all">All genres</SelectItem>
          {primaryGenres.map((g) => (
            <SelectItem key={g.id} value={String(g.id)}>
              {g.nameTranslated ?? g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
