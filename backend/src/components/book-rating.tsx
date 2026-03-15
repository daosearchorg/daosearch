"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Smile, Meh, Frown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/login-dialog";

interface BookRatingProps {
  bookId: number;
  ratingPositive: number;
  ratingNeutral: number;
  ratingNegative: number;
  ratingCount: number;
  initialUserRating?: number | null;
}

type RatingValue = -1 | 0 | 1;

const RATING_OPTIONS = [
  { value: 1 as RatingValue, label: "Good", icon: Smile, active: "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/15 hover:text-green-600 dark:hover:text-green-400" },
  { value: 0 as RatingValue, label: "Neutral", icon: Meh, active: "bg-amber-400/10 border-amber-400/30 text-amber-600 dark:text-amber-400 hover:bg-amber-400/15 hover:text-amber-600 dark:hover:text-amber-400" },
  { value: -1 as RatingValue, label: "Bad", icon: Frown, active: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400" },
] as const;

export function BookRating({ bookId, ratingPositive, ratingNeutral, ratingNegative, ratingCount, initialUserRating }: BookRatingProps) {
  const { status } = useSession();
  const [userRating, setUserRating] = useState<RatingValue | null>((initialUserRating as RatingValue) ?? null);
  const [counts, setCounts] = useState({ positive: ratingPositive, neutral: ratingNeutral, negative: ratingNegative });
  const [total, setTotal] = useState(ratingCount);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const adjustCounts = useCallback((oldRating: RatingValue | null, newRating: RatingValue | null) => {
    setCounts((prev) => {
      const next = { ...prev };
      // Decrement old
      if (oldRating === 1) next.positive--;
      else if (oldRating === 0) next.neutral--;
      else if (oldRating === -1) next.negative--;
      // Increment new
      if (newRating === 1) next.positive++;
      else if (newRating === 0) next.neutral++;
      else if (newRating === -1) next.negative++;
      return next;
    });
    setTotal((prev) => {
      let t = prev;
      if (oldRating != null) t--;
      if (newRating != null) t++;
      return t;
    });
  }, []);

  const handleClick = async (value: RatingValue) => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }
    if (loading) return;
    setLoading(true);

    const oldRating = userRating;

    if (userRating === value) {
      // Remove rating
      setUserRating(null);
      adjustCounts(oldRating, null);
      try {
        await fetch(`/api/books/${bookId}/rating`, { method: "DELETE" });
      } catch {
        // Revert on error
        setUserRating(oldRating);
        adjustCounts(null, oldRating);
      }
    } else {
      // Set or change rating
      setUserRating(value);
      adjustCounts(oldRating, value);
      try {
        await fetch(`/api/books/${bookId}/rating`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: value }),
        });
      } catch {
        // Revert on error
        setUserRating(oldRating);
        adjustCounts(value, oldRating);
      }
    }

    setLoading(false);
  };

  const goodPct = total > 0 ? Math.round((counts.positive / total) * 100) : 0;
  const neutralPct = total > 0 ? Math.round((counts.neutral / total) * 100) : 0;
  const badPct = total > 0 ? 100 - goodPct - neutralPct : 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Face buttons */}
      <div className="flex items-center justify-center gap-3">
        {RATING_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = userRating === option.value;
          const count = option.value === 1 ? counts.positive : option.value === 0 ? counts.neutral : counts.negative;

          return (
            <Button
              key={option.value}
              variant="outline"
              size="sm"
              onClick={() => handleClick(option.value)}
              disabled={loading}
              className={isActive ? option.active : ""}
            >
              <Icon className="size-4" />
              {option.label}
            </Button>
          );
        })}
      </div>
      {/* Bar */}
      <div className="flex h-3 rounded-sm overflow-hidden bg-muted/50">
        {goodPct > 0 && <div className="bg-green-500" style={{ width: `${goodPct}%` }} />}
        {neutralPct > 0 && <div className="bg-amber-400" style={{ width: `${neutralPct}%` }} />}
        {badPct > 0 && <div className="bg-red-500" style={{ width: `${badPct}%` }} />}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Good</span>
          <span className="font-medium">{goodPct}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-400" />
          <span className="text-muted-foreground">Neutral</span>
          <span className="font-medium">{neutralPct}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-500" />
          <span className="text-muted-foreground">Bad</span>
          <span className="font-medium">{badPct}%</span>
        </span>
      </div>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}
