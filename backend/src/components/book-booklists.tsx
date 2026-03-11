"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Users, Heart, LibraryBig, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { booklistUrl } from "@/lib/utils";

interface BooklistItem {
  booklistId: number;
  title: string | null;
  titleTranslated: string | null;
  followerCount: number | null;
  bookCount: number | null;
  curatorComment: string | null;
  curatorCommentTranslated: string | null;
  heartCount: number | null;
}

interface BookBooklistsProps {
  bookId: number;
  initialItems: BooklistItem[];
  total: number;
}

export function BookBooklists({ bookId, initialItems, total }: BookBooklistsProps) {
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const fetchMore = useCallback(async () => {
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/books/${bookId}/booklists?page=${nextPage}`);
      const data = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setPage(nextPage);
    } catch { /* ignore */ }
    setLoading(false);
  }, [bookId, page]);

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Qidian<span className="ml-1.5 normal-case tracking-normal">({total})</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((bl) => (
          <Link
            key={bl.booklistId}
            href={booklistUrl(bl.booklistId, bl.titleTranslated || bl.title)}
            className="flex flex-col gap-2 rounded-lg border border-border/50 p-4 hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm sm:text-base font-medium leading-snug line-clamp-2">
              {bl.titleTranslated || bl.title || "Untitled Booklist"}
            </span>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {bl.followerCount != null && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Users className="size-3.5 shrink-0" />
                  {bl.followerCount.toLocaleString()}
                </span>
              )}
              {bl.bookCount != null && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <LibraryBig className="size-3.5 shrink-0" />
                  {bl.bookCount.toLocaleString()}
                </span>
              )}
              {bl.heartCount != null && bl.heartCount > 0 && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Heart className="size-3.5 shrink-0" />
                  {bl.heartCount.toLocaleString()}
                </span>
              )}
            </div>
            {(bl.curatorCommentTranslated || bl.curatorComment) && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {bl.curatorCommentTranslated || bl.curatorComment}
              </p>
            )}
          </Link>
        ))}
      </div>

      {items.length < total && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={fetchMore}
            disabled={loading}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
