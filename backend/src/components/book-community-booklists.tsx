"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Users, LibraryBig, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { communityBooklistUrl } from "@/lib/utils";

interface CommunityBooklistItem {
  listId: number;
  name: string;
  followerCount: number;
  itemCount: number;
  ownerUsername: string;
  curatorComment: string | null;
}

interface BookCommunityBooklistsProps {
  bookId: number;
  initialItems: CommunityBooklistItem[];
  total: number;
}

export function BookCommunityBooklists({ bookId, initialItems, total }: BookCommunityBooklistsProps) {
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const fetchMore = useCallback(async () => {
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/books/${bookId}/community-booklists?page=${nextPage}`);
      const data = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setPage(nextPage);
    } catch { /* ignore */ }
    setLoading(false);
  }, [bookId, page]);

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Community<span className="ml-1.5 normal-case tracking-normal">({total})</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.listId}
            href={communityBooklistUrl(item.listId, item.name)}
            className="flex flex-col gap-2 rounded-lg border border-border/50 p-4 hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm sm:text-base font-medium leading-snug line-clamp-2">
              {item.name}
            </span>
            <span className="text-xs text-muted-foreground">{item.ownerUsername}</span>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users className="size-3.5 shrink-0" />
                {item.followerCount.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <LibraryBig className="size-3.5 shrink-0" />
                {item.itemCount.toLocaleString()}
              </span>
            </div>
            {item.curatorComment && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {item.curatorComment}
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
