"use client";

import { useState, useCallback } from "react";
import { Heart } from "lucide-react";

interface CommunityBooklistItemLikeProps {
  listId: number;
  itemId: number;
  initialLiked: boolean;
  likeCount: number;
}

export function CommunityBooklistItemLike({ listId, itemId, initialLiked, likeCount }: CommunityBooklistItemLikeProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(likeCount);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    setLoading(true);
    try {
      const method = liked ? "DELETE" : "POST";
      const res = await fetch(`/api/lists/${listId}/items/${itemId}/like`, { method });
      if (res.ok) {
        setLiked((prev) => !prev);
        setCount((prev) => prev + (liked ? -1 : 1));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [listId, itemId, liked]);

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50"
    >
      <Heart
        className={`size-4 shrink-0 transition-colors ${liked ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
      />
      {count > 0 && (
        <span className={`tabular-nums text-xs ${liked ? "text-red-500" : "text-muted-foreground"}`}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}
