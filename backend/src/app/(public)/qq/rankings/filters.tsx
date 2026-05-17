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
  GENDERS,
  GENDER_LABELS,
  GENDER_RANK_TYPES,
  RANK_TYPE_LABELS,
  RANK_TYPE_CYCLES,
  PUBLISH_RANK_TYPE_CYCLES,
  RANK_TYPE_CYCLE_LABELS,
  type Gender,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useCallback, useTransition } from "react";

interface Genre {
  id: number;
  name: string;
  nameTranslated: string | null;
}

interface RankingFiltersProps {
  gender: Gender;
  rankType: string;
  cycle: string;
  primaryGenres: Genre[];
  genreId?: number;
}

export function RankingFilters({
  gender,
  rankType,
  cycle,
  primaryGenres,
  genreId,
}: RankingFiltersProps) {
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

  const rankTypes = GENDER_RANK_TYPES[gender] ?? GENDER_RANK_TYPES.male;
  const cycleMap = gender === "publish" ? PUBLISH_RANK_TYPE_CYCLES : RANK_TYPE_CYCLES;
  const cycles = cycleMap[rankType] ?? ["cycle-1"];
  const cycleLabels = RANK_TYPE_CYCLE_LABELS[rankType] ?? {};

  const getCycleLabel = (c: string) => cycleLabels[c] ?? c;

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 w-full">
      {/* Gender + cycle row */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="inline-flex items-center rounded-lg bg-muted p-1">
          {GENDERS.map((g) => (
            <button
              key={g}
              onClick={() => {
                const newRankType = GENDER_RANK_TYPES[g][0];
                const newCycles = (g === "publish" ? PUBLISH_RANK_TYPE_CYCLES : RANK_TYPE_CYCLES)[newRankType] ?? ["cycle-1"];
                const newCycle = newCycles[0];
                setParams({
                  gender: g,
                  type: newRankType,
                  cycle: newCycle,
                });
              }}
              className={cn(
                "rounded-md px-3 sm:px-5 py-1.5 text-sm font-medium transition-colors",
                gender === g
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {GENDER_LABELS[g]}
            </button>
          ))}
        </div>

        {cycles.length > 1 && (
          <Select value={cycle} onValueChange={(c) => setParams({ cycle: c })}>
            <SelectTrigger className="min-w-28 sm:min-w-32 h-9">
              <SelectValue>{getCycleLabel(cycle)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {cycles.map((c) => (
                <SelectItem key={c} value={c}>
                  {getCycleLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Rank type pills */}
      <div className="flex flex-wrap items-center justify-center gap-1">
        {rankTypes.map((rt) => (
          <button
            key={rt}
            onClick={() => {
              const newCycles = (gender === "publish" ? PUBLISH_RANK_TYPE_CYCLES : RANK_TYPE_CYCLES)[rt] ?? ["cycle-1"];
              const newCycle = newCycles[0];
              setParams({ type: rt, cycle: newCycle });
            }}
            className={cn(
              "rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-sm font-medium transition-colors",
              rankType === rt
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {RANK_TYPE_LABELS[rt] ?? rt}
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
