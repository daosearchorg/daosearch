"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QIDIAN_RANK_TYPES,
  QIDIAN_RANK_TYPE_LABELS,
  QIDIAN_GENRE_CHANNELS,
  QIDIAN_GENRE_CHANNEL_LABELS,
  type QidianRankType,
  type QidianGenreChannel,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useCallback, useTransition } from "react";

interface RankingFiltersProps {
  rankType: QidianRankType;
  genreChannel: QidianGenreChannel;
}

export function RankingFilters({ rankType, genreChannel }: RankingFiltersProps) {
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
      {/* Rank type pills */}
      <div className="flex flex-wrap items-center justify-center gap-1">
        {QIDIAN_RANK_TYPES.map((rt) => (
          <button
            key={rt}
            onClick={() => setParams({ type: rt })}
            className={cn(
              "rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-sm font-medium transition-colors",
              rankType === rt
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {QIDIAN_RANK_TYPE_LABELS[rt]}
          </button>
        ))}
      </div>

      {/* Genre channel filter */}
      <Select
        value={genreChannel}
        onValueChange={(v) => {
          if (v === "overall") {
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
          {QIDIAN_GENRE_CHANNELS.map((ch) => (
            <SelectItem key={ch} value={ch}>
              {QIDIAN_GENRE_CHANNEL_LABELS[ch]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
