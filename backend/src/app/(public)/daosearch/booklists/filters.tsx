"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { value: "popular", label: "Most Followed" },
  { value: "recent", label: "Recently Updated" },
  { value: "largest", label: "Most Books" },
] as const;

type BooklistSort = (typeof SORT_OPTIONS)[number]["value"];

interface CommunityBooklistFiltersProps {
  sort: BooklistSort;
}

export function CommunityBooklistFilters({ sort }: CommunityBooklistFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setSort = useCallback((nextSort: BooklistSort) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextSort === "recent") params.delete("sort");
    else params.set("sort", nextSort);

    params.delete("page");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {SORT_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => setSort(option.value)}
          className={cn(
            "rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-sm font-medium transition-colors",
            sort === option.value
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
