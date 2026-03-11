"use client";

import { useState, useCallback } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CommunityBooklistFollowProps {
  listId: number;
  initialFollowed: boolean;
  followerCount: number;
}

export function CommunityBooklistFollow({ listId, initialFollowed, followerCount }: CommunityBooklistFollowProps) {
  const [followed, setFollowed] = useState(initialFollowed);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    setLoading(true);
    try {
      const method = followed ? "DELETE" : "POST";
      const res = await fetch(`/api/lists/${listId}/follow`, { method });
      if (res.ok) {
        setFollowed((prev) => !prev);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [listId, followed]);

  return (
    <span className="ml-auto">
      {/* Desktop: text button */}
      <Button
        variant={followed ? "default" : "outline"}
        size="sm"
        onClick={toggle}
        disabled={loading}
        className="hidden sm:inline-flex"
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Bookmark className="size-3.5" />
        )}
        {followed ? "Following" : "Follow"}
      </Button>
      {/* Mobile: icon button */}
      <Button
        variant={followed ? "default" : "outline"}
        size="icon"
        onClick={toggle}
        disabled={loading}
        className="sm:hidden size-8"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Bookmark className="size-4" />
        )}
      </Button>
    </span>
  );
}
