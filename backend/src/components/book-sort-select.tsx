"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookSort } from "@/lib/types";

const SORT_OPTIONS = [
  { value: "bookmarked", label: "Date added" },
  { value: "last_read", label: "Last read" },
  { value: "recently_updated", label: "Recently updated" },
  { value: "unread", label: "Unread chapters" },
] as const;

const STORAGE_KEY = "book-sort";

export function BookSortSelect({ current }: { current: BookSort }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, current);
    }
  }, [current]);

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className="h-7 text-xs w-auto gap-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
