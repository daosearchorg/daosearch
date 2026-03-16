"use client";

import { useState, useCallback, useMemo, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LIBRARY_SORT_OPTIONS,
  POPULARITY_PERIOD_OPTIONS,
} from "@/lib/constants";

interface Genre {
  id: number;
  name: string;
  nameTranslated: string | null;
}

interface GenrePairs {
  genreToSub: Record<number, number[]>;
  subToGenre: Record<number, number[]>;
}

interface PopularTag {
  id: number;
  name: string;
  displayName: string;
  count: number;
}

interface LibraryFiltersProps {
  primaryGenres: Genre[];
  subgenres: Genre[];
  genrePairs: GenrePairs;
  popularTags: PopularTag[];
}

export function LibraryFilters({ primaryGenres, subgenres, genrePairs, popularTags }: LibraryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [name, setName] = useState(searchParams.get("name") ?? "");
  const [author, setAuthor] = useState(searchParams.get("author") ?? "");
  const [exact, setExact] = useState(searchParams.get("exact") === "1");
  const [genre, setGenre] = useState(searchParams.get("genre") ?? "");
  const [subgenre, setSubgenre] = useState(searchParams.get("subgenre") ?? "");
  const initTagIds = (searchParams.get("tag") ?? "").split(",").map(Number).filter((n) => n > 0);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(initTagIds);

  // Cross-filter: narrow subgenres when a primary genre is selected
  const filteredSubgenres = useMemo(() => {
    if (!genre) return subgenres;
    const validIds = new Set(genrePairs.genreToSub[Number(genre)] ?? []);
    return subgenres.filter((g) => validIds.has(g.id));
  }, [subgenres, genre, genrePairs]);
  const [minWords, setMinWords] = useState(searchParams.get("minWords") ?? "");
  const [maxWords, setMaxWords] = useState(searchParams.get("maxWords") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [gender, setGender] = useState(searchParams.get("gender") ?? "");
  // Combined time filter: "within-7", "within-30", "older-90", etc. or ""
  const initTimeFilter = searchParams.has("updatedWithin")
    ? `within-${searchParams.get("updatedWithin")}`
    : searchParams.has("olderThan")
      ? `older-${searchParams.get("olderThan")}`
      : "";
  const [timeFilter, setTimeFilter] = useState(initTimeFilter);
  const [sort, setSort] = useState(searchParams.get("sort") ?? "updated");
  const [popularityPeriod, setPopularityPeriod] = useState(searchParams.get("popularityPeriod") ?? "weekly");
  const [order, setOrder] = useState(searchParams.get("order") ?? "desc");
  const hasAdvancedFilters = !!(searchParams.get("author") || searchParams.get("exact") || searchParams.get("genre") || searchParams.get("subgenre") || searchParams.get("minWords") || searchParams.get("maxWords") || searchParams.get("status") || searchParams.get("gender") || searchParams.has("updatedWithin") || searchParams.has("olderThan") || searchParams.get("tag"));
  const [expanded, setExpanded] = useState(hasAdvancedFilters);

  const apply = useCallback(() => {
    const params = new URLSearchParams();
    if (name.trim()) params.set("name", name.trim());
    if (author.trim()) params.set("author", author.trim());
    if (exact) params.set("exact", "1");
    if (genre) params.set("genre", genre);
    if (subgenre) params.set("subgenre", subgenre);
    if (minWords) params.set("minWords", minWords);
    if (maxWords) params.set("maxWords", maxWords);
    if (status) params.set("status", status);
    if (gender) params.set("gender", gender);
    if (timeFilter) {
      const [type, val] = timeFilter.split("-");
      if (type === "within") params.set("updatedWithin", val);
      else if (type === "older") params.set("olderThan", val);
    }
    if (selectedTagIds.length > 0) params.set("tag", selectedTagIds.join(","));
    const hasSearch = !!(name.trim() || author.trim());
    const effectiveSort = hasSearch && sort === "updated" ? "relevance" : sort;
    if (effectiveSort && effectiveSort !== "updated") params.set("sort", effectiveSort);
    if (sort === "popularity" && popularityPeriod !== "weekly") params.set("popularityPeriod", popularityPeriod);
    if (order !== "desc") params.set("order", order);
    params.set("page", "1");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }, [router, pathname, name, author, exact, genre, subgenre, minWords, maxWords, status, gender, timeFilter, sort, popularityPeriod, order, selectedTagIds]);

  const clear = useCallback(() => {
    setName("");
    setAuthor("");
    setExact(false);
    setGenre("");
    setSubgenre("");
    setMinWords("");
    setMaxWords("");
    setStatus("");
    setGender("");
    setTimeFilter("");
    setSort("updated");
    setPopularityPeriod("weekly");
    setOrder("desc");
    setSelectedTagIds([]);
    startTransition(() => router.push(pathname));
  }, [router, pathname]);

  // Debounce title search when collapsed (auto-apply only on name change)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const mountedRef = useRef(false);

  useEffect(() => {
    // Skip the initial mount — only debounce when user actually types
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (expandedRef.current) return; // only auto-apply when collapsed
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      applyRef.current();
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [name]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") apply();
  };

  // Active filter badges
  const activeFilters: { label: string; clear: () => void }[] = [];
  if (searchParams.get("name")) {
    activeFilters.push({ label: `Title: ${searchParams.get("name")}`, clear: () => { setName(""); removeParam("name"); } });
  }
  if (searchParams.get("author")) {
    activeFilters.push({ label: `Author: ${searchParams.get("author")}`, clear: () => { setAuthor(""); removeParam("author"); } });
  }
  if (searchParams.get("genre")) {
    const g = primaryGenres.find((g) => String(g.id) === searchParams.get("genre"));
    activeFilters.push({ label: `Genre: ${g?.nameTranslated ?? g?.name ?? searchParams.get("genre")}`, clear: () => { setGenre(""); removeParam("genre"); } });
  }
  if (searchParams.get("subgenre")) {
    const g = subgenres.find((g) => String(g.id) === searchParams.get("subgenre"));
    activeFilters.push({ label: `Subgenre: ${g?.nameTranslated ?? g?.name ?? searchParams.get("subgenre")}`, clear: () => { setSubgenre(""); removeParam("subgenre"); } });
  }
  if (searchParams.get("status")) {
    const s = searchParams.get("status")!;
    const label = s === "ongoing" ? "Ongoing" : s === "completed" ? "Completed" : s;
    activeFilters.push({ label: `Status: ${label}`, clear: () => { setStatus(""); removeParam("status"); } });
  }
  if (searchParams.get("gender")) {
    const g = searchParams.get("gender")!;
    const label = g === "male" ? "Male Lead" : g === "female" ? "Female Lead" : g;
    activeFilters.push({ label: `Audience: ${label}`, clear: () => { setGender(""); removeParam("gender"); } });
  }

  if (searchParams.get("tag")) {
    const tagIdList = (searchParams.get("tag") ?? "").split(",").map(Number).filter((n) => n > 0);
    for (const tid of tagIdList) {
      const tag = popularTags.find((t) => t.id === tid);
      if (tag) {
        activeFilters.push({
          label: `Tag: ${tag.displayName}`,
          clear: () => {
            const newIds = selectedTagIds.filter((id) => id !== tid);
            setSelectedTagIds(newIds);
            const params = new URLSearchParams(searchParams.toString());
            if (newIds.length > 0) {
              params.set("tag", newIds.join(","));
            } else {
              params.delete("tag");
            }
            params.set("page", "1");
            startTransition(() => router.push(`${pathname}?${params.toString()}`));
          },
        });
      }
    }
  }

  function removeParam(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.set("page", "1");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Always visible: Title search + sort row */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by title..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-10 flex-1"
        />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-10 w-auto min-w-[9rem] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIBRARY_SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <span className="inline-flex items-center gap-1.5">
                  {s.label}
                  {s.source === "community" && (
                    <span className="inline-flex items-center justify-center size-4 rounded text-[10px] font-semibold leading-none bg-violet-500/15 text-violet-600 dark:text-violet-400">C</span>
                  )}
                  {s.source === "qidian" && (
                    <span className="inline-flex items-center justify-center size-4 rounded text-[10px] font-semibold leading-none bg-orange-500/15 text-orange-600 dark:text-orange-400">Q</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mobile: expand/collapse toggle */}
      <button
        type="button"
        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors sm:hidden"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Less filters" : "More filters"}
        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
      </button>

      {/* Expandable filter fields — always visible on desktop, toggled on mobile */}
      <div className={cn("flex flex-col gap-3", !expanded && "hidden sm:flex")}>
        {/* Author */}
        <Input
          placeholder="Search by author..."
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-10"
        />

        {/* Genre + Subgenre */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select
            value={genre || "all"}
            onValueChange={(v) => { setGenre(v === "all" ? "" : v); setSubgenre(""); }}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="All genres" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-60 max-w-[var(--radix-select-trigger-width)]">
              <SelectItem value="all">All genres</SelectItem>
              {primaryGenres.map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {g.nameTranslated ?? g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={subgenre || "all"}
            onValueChange={(v) => setSubgenre(v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="All subgenres" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-60 max-w-[var(--radix-select-trigger-width)]">
              <SelectItem value="all">All subgenres</SelectItem>
              {filteredSubgenres.map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {g.nameTranslated ?? g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status + Audience */}
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={status || "any"}
            onValueChange={(v) => setStatus(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              <SelectItem value="ongoing">Ongoing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={gender || "any"}
            onValueChange={(v) => setGender(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Any audience" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any audience</SelectItem>
              <SelectItem value="male">Male Lead</SelectItem>
              <SelectItem value="female">Female Lead</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Word count */}
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={minWords || "any"}
            onValueChange={(v) => setMinWords(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Min words" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Min words</SelectItem>
              <SelectItem value="10000">10K+</SelectItem>
              <SelectItem value="50000">50K+</SelectItem>
              <SelectItem value="100000">100K+</SelectItem>
              <SelectItem value="200000">200K+</SelectItem>
              <SelectItem value="500000">500K+</SelectItem>
              <SelectItem value="1000000">1M+</SelectItem>
              <SelectItem value="2000000">2M+</SelectItem>
              <SelectItem value="5000000">5M+</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={maxWords || "any"}
            onValueChange={(v) => setMaxWords(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Max words" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Max words</SelectItem>
              <SelectItem value="10000">Under 10K</SelectItem>
              <SelectItem value="50000">Under 50K</SelectItem>
              <SelectItem value="100000">Under 100K</SelectItem>
              <SelectItem value="200000">Under 200K</SelectItem>
              <SelectItem value="500000">Under 500K</SelectItem>
              <SelectItem value="1000000">Under 1M</SelectItem>
              <SelectItem value="2000000">Under 2M</SelectItem>
              <SelectItem value="5000000">Under 5M</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Time + Order + Match mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select
            value={timeFilter || "any"}
            onValueChange={(v) => setTimeFilter(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Any time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time</SelectItem>
              <SelectItem value="within-7">Active in last 7 days</SelectItem>
              <SelectItem value="within-30">Active in last 30 days</SelectItem>
              <SelectItem value="within-90">Active in last 3 months</SelectItem>
              <SelectItem value="within-180">Active in last 6 months</SelectItem>
              <SelectItem value="within-365">Active in last year</SelectItem>
              <SelectItem value="older-30">Inactive 30+ days</SelectItem>
              <SelectItem value="older-90">Inactive 3+ months</SelectItem>
              <SelectItem value="older-180">Inactive 6+ months</SelectItem>
              <SelectItem value="older-365">Inactive 1+ year</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-center sm:justify-end gap-2">
            <div className="inline-flex items-center rounded-lg bg-muted p-1">
              <button
                onClick={() => setOrder("desc")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  order === "desc"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Desc
              </button>
              <button
                onClick={() => setOrder("asc")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  order === "asc"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Asc
              </button>
            </div>
            <div className="inline-flex items-center rounded-lg bg-muted p-1">
              <button
                onClick={() => setExact(false)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  !exact
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Fuzzy
              </button>
              <button
                onClick={() => setExact(true)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  exact
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Exact
              </button>
            </div>
          </div>
        </div>
        {/* Community tags */}
        {popularTags.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {popularTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      setSelectedTagIds((prev) =>
                        isSelected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                      );
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      isSelected
                        ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {tag.displayName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sort === "popularity" && (
          <Select value={popularityPeriod} onValueChange={setPopularityPeriod}>
            <SelectTrigger className="h-10 w-full sm:w-1/2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POPULARITY_PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Apply + Clear — always on desktop, only when expanded on mobile */}
      <div className={cn("flex items-center gap-2 justify-center", !expanded && "hidden sm:flex")}>
        <Button className="h-10 px-8" onClick={apply}>
          Apply
        </Button>
        <Button variant="outline" className="h-10 px-8" onClick={clear}>
          Clear
        </Button>
      </div>

      {/* Active filter badges */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeFilters.map((f) => (
            <button
              key={f.label}
              onClick={f.clear}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              {f.label}
              <X className="size-3.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
