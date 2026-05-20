"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BOOKLIST_SORT_OPTIONS,
  BOOKLIST_UPDATED_WITHIN_OPTIONS,
  BOOKLIST_FOLLOWER_PRESETS,
  BOOKLIST_BOOK_COUNT_PRESETS,
  type BooklistSort,
} from "@/lib/constants";

interface BooklistFiltersInitial {
  name?: string;
  sort: BooklistSort;
  order: "asc" | "desc";
  qidianTags?: string[];
  tagIds?: number[];
  minFollowers?: number;
  maxFollowers?: number;
  minBookCount?: number;
  maxBookCount?: number;
  updatedWithin?: number;
}

interface BooklistFiltersProps {
  source: "qidian" | "community";
  initial: BooklistFiltersInitial;
  qidianTagCloud?: { tag: string; count: number }[];
  popularTags?: { id: number; displayName: string; count: number }[];
}

export function BooklistFilters({
  source,
  initial,
  qidianTagCloud = [],
  popularTags = [],
}: BooklistFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [name, setName] = useState(initial.name ?? "");
  const [sort, setSort] = useState<BooklistSort>(initial.sort);
  const [order, setOrder] = useState<"asc" | "desc">(initial.order);
  const [qidianTags, setQidianTags] = useState<string[]>(initial.qidianTags ?? []);
  const [tagIds, setTagIds] = useState<number[]>(initial.tagIds ?? []);
  const [minFollowers, setMinFollowers] = useState<string>(
    initial.minFollowers != null ? String(initial.minFollowers) : "",
  );
  const [maxFollowers, setMaxFollowers] = useState<string>(
    initial.maxFollowers != null ? String(initial.maxFollowers) : "",
  );
  const [minBookCount, setMinBookCount] = useState<string>(
    initial.minBookCount != null ? String(initial.minBookCount) : "",
  );
  const [maxBookCount, setMaxBookCount] = useState<string>(
    initial.maxBookCount != null ? String(initial.maxBookCount) : "",
  );
  const [updatedWithin, setUpdatedWithin] = useState<string>(
    initial.updatedWithin != null ? String(initial.updatedWithin) : "",
  );

  const hasAdvancedFilters = !!(
    initial.qidianTags?.length ||
    initial.tagIds?.length ||
    initial.minFollowers != null ||
    initial.maxFollowers != null ||
    initial.minBookCount != null ||
    initial.maxBookCount != null ||
    initial.updatedWithin != null
  );
  const [expanded, setExpanded] = useState(hasAdvancedFilters);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  // Source toggle lives inside the filter bar (was a separate tab strip).
  // Switching navigates to the other route, preserving the filter params that
  // are valid on both sides (`name`, `sort`, `order`, ranges, updatedWithin).
  // Tag selections are source-specific (qtag vs tag) and intentionally dropped.
  const switchSource = useCallback((next: "qidian" | "community") => {
    if (next === source) return;
    const target = next === "qidian" ? "/qidian/booklists" : "/daosearch/booklists";
    const params = new URLSearchParams();
    if (name.trim()) params.set("name", name.trim());
    const hasSearch = !!name.trim();
    const effectiveSort: BooklistSort = hasSearch && sort === "recent" ? "relevance" : sort;
    if (effectiveSort !== "recent" && effectiveSort !== "relevance") {
      params.set("sort", effectiveSort);
    }
    if (order !== "desc") params.set("order", order);
    if (minFollowers) params.set("minF", minFollowers);
    if (maxFollowers) params.set("maxF", maxFollowers);
    if (minBookCount) params.set("minB", minBookCount);
    if (maxBookCount) params.set("maxB", maxBookCount);
    if (updatedWithin) params.set("within", updatedWithin);
    params.set("page", "1");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${target}?${qs}` : target));
  }, [router, source, name, sort, order, minFollowers, maxFollowers, minBookCount, maxBookCount, updatedWithin]);

  const apply = useCallback(() => {
    const params = new URLSearchParams();
    if (name.trim()) params.set("name", name.trim());

    const hasSearch = !!name.trim();
    // When searching and no explicit sort is chosen, swap to "relevance"
    // (mirrors LibraryFilters' implicit-relevance behaviour).
    const effectiveSort: BooklistSort = hasSearch && sort === "recent" ? "relevance" : sort;
    if (effectiveSort !== "recent" && effectiveSort !== "relevance") {
      params.set("sort", effectiveSort);
    } else if (effectiveSort === "relevance" && !hasSearch) {
      // relevance without a name search is meaningless — drop it
    }
    if (order !== "desc") params.set("order", order);

    if (source === "qidian" && qidianTags.length > 0) {
      params.set("qtag", qidianTags.map((t) => encodeURIComponent(t)).join(","));
    }
    if (source === "community" && tagIds.length > 0) {
      params.set("tag", tagIds.join(","));
    }
    if (minFollowers) params.set("minF", minFollowers);
    if (maxFollowers) params.set("maxF", maxFollowers);
    if (minBookCount) params.set("minB", minBookCount);
    if (maxBookCount) params.set("maxB", maxBookCount);
    if (updatedWithin) params.set("within", updatedWithin);

    params.set("page", "1");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }, [
    router, pathname, source, name, sort, order, qidianTags, tagIds,
    minFollowers, maxFollowers, minBookCount, maxBookCount, updatedWithin,
  ]);

  const clear = useCallback(() => {
    setName("");
    setSort("recent");
    setOrder("desc");
    setQidianTags([]);
    setTagIds([]);
    setMinFollowers("");
    setMaxFollowers("");
    setMinBookCount("");
    setMaxBookCount("");
    setUpdatedWithin("");
    startTransition(() => router.push(pathname));
  }, [router, pathname]);

  // Debounce title search when filters are collapsed (auto-apply on name typing only).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (expandedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyRef.current(), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [name]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") apply();
  };

  function removeParam(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.set("page", "1");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  // ---- Active filter badges -----------------------------------------------
  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (initial.name) {
    activeFilters.push({
      key: "name",
      label: `Title: ${initial.name}`,
      clear: () => { setName(""); removeParam("name"); },
    });
  }
  if (source === "qidian" && initial.qidianTags?.length) {
    for (const tag of initial.qidianTags) {
      activeFilters.push({
        key: `qtag-${tag}`,
        label: `Tag: ${tag}`,
        clear: () => {
          const next = qidianTags.filter((t) => t !== tag);
          setQidianTags(next);
          const params = new URLSearchParams(searchParams.toString());
          if (next.length > 0) {
            params.set("qtag", next.map((t) => encodeURIComponent(t)).join(","));
          } else {
            params.delete("qtag");
          }
          params.set("page", "1");
          startTransition(() => router.push(`${pathname}?${params.toString()}`));
        },
      });
    }
  }
  if (source === "community" && initial.tagIds?.length) {
    for (const tid of initial.tagIds) {
      const t = popularTags.find((pt) => pt.id === tid);
      activeFilters.push({
        key: `tag-${tid}`,
        label: `Tag: ${t?.displayName ?? `#${tid}`}`,
        clear: () => {
          const next = tagIds.filter((id) => id !== tid);
          setTagIds(next);
          const params = new URLSearchParams(searchParams.toString());
          if (next.length > 0) params.set("tag", next.join(","));
          else params.delete("tag");
          params.set("page", "1");
          startTransition(() => router.push(`${pathname}?${params.toString()}`));
        },
      });
    }
  }
  if (initial.minFollowers != null) {
    activeFilters.push({
      key: "minF",
      label: `Followers ≥ ${initial.minFollowers.toLocaleString()}`,
      clear: () => { setMinFollowers(""); removeParam("minF"); },
    });
  }
  if (initial.maxFollowers != null) {
    activeFilters.push({
      key: "maxF",
      label: `Followers ≤ ${initial.maxFollowers.toLocaleString()}`,
      clear: () => { setMaxFollowers(""); removeParam("maxF"); },
    });
  }
  if (initial.minBookCount != null) {
    activeFilters.push({
      key: "minB",
      label: `Books ≥ ${initial.minBookCount}`,
      clear: () => { setMinBookCount(""); removeParam("minB"); },
    });
  }
  if (initial.maxBookCount != null) {
    activeFilters.push({
      key: "maxB",
      label: `Books ≤ ${initial.maxBookCount}`,
      clear: () => { setMaxBookCount(""); removeParam("maxB"); },
    });
  }
  if (initial.updatedWithin != null) {
    const opt = BOOKLIST_UPDATED_WITHIN_OPTIONS.find((o) => o.value === initial.updatedWithin);
    activeFilters.push({
      key: "within",
      label: opt?.label ?? `Within ${initial.updatedWithin}d`,
      clear: () => { setUpdatedWithin(""); removeParam("within"); },
    });
  }

  // ---- Multi-select tag dropdown (Qidian uses tag-name strings; community
  // uses tag ids). The trigger renders as a SelectTrigger-shaped button so it
  // sits visually flush with the other dropdowns in the filter rows.
  const selectedTagCount = source === "qidian" ? qidianTags.length : tagIds.length;
  const tagButtonLabel = (() => {
    if (source === "qidian") {
      if (qidianTags.length === 0) return "Any tag";
      if (qidianTags.length === 1) return qidianTags[0];
      return `${qidianTags.length} tags`;
    }
    if (tagIds.length === 0) return "Any tag";
    if (tagIds.length === 1) {
      const t = popularTags.find((pt) => pt.id === tagIds[0]);
      return t?.displayName ?? "1 tag";
    }
    return `${tagIds.length} tags`;
  })();

  const tagListEmpty =
    (source === "qidian" && qidianTagCloud.length === 0) ||
    (source === "community" && popularTags.length === 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1 — name search + sort. On mobile the sort wraps to the next line
          so the search input takes the full width; on desktop they share a row.
          Source dropdown lives in the order-toggle row below, alongside Desc/Asc. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Input
          placeholder="Search booklists..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-10 sm:flex-1"
        />
        <Select value={sort} onValueChange={(v) => setSort(v as BooklistSort)}>
          <SelectTrigger className="h-10 w-full sm:w-auto sm:min-w-[10rem] sm:shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOOKLIST_SORT_OPTIONS.filter((o) => o.value !== "relevance" || !!name.trim()).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mobile expand/collapse — desktop always shows everything. */}
      <button
        type="button"
        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors sm:hidden"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Less filters" : "More filters"}
        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
      </button>

      <div className={cn("flex flex-col gap-3", !expanded && "hidden sm:flex")}>
        {/* Row 2 — follower + book count ranges + updated-within. */}
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={minFollowers || "any"}
            onValueChange={(v) => setMinFollowers(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Min followers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Min followers</SelectItem>
              {BOOKLIST_FOLLOWER_PRESETS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n.toLocaleString()}+</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={maxFollowers || "any"}
            onValueChange={(v) => setMaxFollowers(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Max followers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Max followers</SelectItem>
              {BOOKLIST_FOLLOWER_PRESETS.map((n) => (
                <SelectItem key={n} value={String(n)}>Under {n.toLocaleString()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            value={minBookCount || "any"}
            onValueChange={(v) => setMinBookCount(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Min books" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Min books</SelectItem>
              {BOOKLIST_BOOK_COUNT_PRESETS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}+</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={maxBookCount || "any"}
            onValueChange={(v) => setMaxBookCount(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Max books" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Max books</SelectItem>
              {BOOKLIST_BOOK_COUNT_PRESETS.map((n) => (
                <SelectItem key={n} value={String(n)}>Under {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select
            value={updatedWithin || "any"}
            onValueChange={(v) => setUpdatedWithin(v === "any" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Any time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time</SelectItem>
              {BOOKLIST_UPDATED_WITHIN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Multi-select tag dropdown — styled to match the other Select rows. */}
          <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={tagListEmpty}
                className={cn(
                  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                  selectedTagCount === 0 && "text-muted-foreground",
                )}
              >
                <span className="truncate">{tagButtonLabel}</span>
                <ChevronDown className="size-4 opacity-50 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[var(--radix-popover-trigger-width)] max-h-72 overflow-y-auto p-1"
            >
              {source === "qidian" && qidianTagCloud.map((t) => {
                const isSelected = qidianTags.includes(t.tag);
                return (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() =>
                      setQidianTags((prev) =>
                        isSelected ? prev.filter((x) => x !== t.tag) : [...prev, t.tag],
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                      isSelected && "text-foreground",
                    )}
                  >
                    <span className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      isSelected
                        ? "border-orange-500 bg-orange-500/15 text-orange-600 dark:text-orange-400"
                        : "border-border",
                    )}>
                      {isSelected && <Check className="size-3" />}
                    </span>
                    <span className="truncate flex-1 text-left">{t.tag}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{t.count}</span>
                  </button>
                );
              })}
              {source === "community" && popularTags.map((t) => {
                const isSelected = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setTagIds((prev) =>
                        isSelected ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                      isSelected && "text-foreground",
                    )}
                  >
                    <span className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      isSelected
                        ? "border-violet-500 bg-violet-500/15 text-violet-600 dark:text-violet-400"
                        : "border-border",
                    )}>
                      {isSelected && <Check className="size-3" />}
                    </span>
                    <span className="truncate flex-1 text-left">{t.displayName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{t.count}</span>
                  </button>
                );
              })}
              {tagListEmpty && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No tags available
                </p>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Source dropdown + Desc/Asc toggle — paired on one row. */}
        <div className="flex items-center justify-between gap-2">
          <Select value={source} onValueChange={(v) => switchSource(v as "qidian" | "community")}>
            <SelectTrigger className="h-10 w-auto min-w-[9rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="qidian">Qidian</SelectItem>
              <SelectItem value="community">Community</SelectItem>
            </SelectContent>
          </Select>
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
        </div>
      </div>

      {/* Apply + Clear. */}
      <div className={cn("flex items-center gap-2 justify-center", !expanded && "hidden sm:flex")}>
        <Button className="h-10 px-8" onClick={apply}>Apply</Button>
        <Button variant="outline" className="h-10 px-8" onClick={clear}>Clear</Button>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {activeFilters.map((f) => (
            <button
              key={f.key}
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
