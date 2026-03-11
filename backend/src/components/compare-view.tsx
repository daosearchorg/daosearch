"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bookUrl, cn } from "@/lib/utils";
import { ScrollText, Star, MessageSquareText, Users, Bookmark, BookOpen, Heart, ArrowRightLeft, X } from "lucide-react";

type Book = {
  id: number;
  imageUrl: string | null;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  synopsis: string | null;
  synopsisTranslated: string | null;
  genreNameTranslated: string | null;
  subgenreNameTranslated: string | null;
  wordCount: number | null;
  status: string | null;
  qqScore: string | null;
  qqScoreCount: number | null;
  qqFavoriteCount: number | null;
  qqFanCount: number | null;
  updateTime: Date | null;
};

type Stats = {
  chapterCount: number | null;
  ratingCount: number | null;
  ratingPositive: number | null;
  ratingNeutral: number | null;
  ratingNegative: number | null;
  commentCount: number | null;
  reviewCount: number | null;
  readerCount: number | null;
  bookmarkCount: number | null;
} | null;

type Tag = { id: number; name: string; displayName: string | null; count: number };

interface CompareViewProps {
  bookA: Book;
  bookB: Book;
  statsA: Stats;
  statsB: Stats;
  tagsA: Tag[];
  tagsB: Tag[];
  overlap: number;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function pct(pos: number | null, total: number | null): string {
  if (!pos || !total || total === 0) return "—";
  return `${Math.round((pos / total) * 100)}%`;
}

function winClass(a: number | null | undefined, b: number | null | undefined): [string, string] {
  const av = a ?? 0;
  const bv = b ?? 0;
  if (av === bv) return ["", ""];
  return av > bv
    ? ["text-green-600 dark:text-green-500", ""]
    : ["", "text-green-600 dark:text-green-500"];
}

function StatRow({ label, icon: Icon, valA, valB, fmtFn = fmt }: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  valA: number | null | undefined;
  valB: number | null | undefined;
  fmtFn?: (n: number | null | undefined) => string;
}) {
  const [clsA, clsB] = winClass(valA, valB);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 border-b border-border/40 last:border-0">
      <div className={cn("text-right tabular-nums text-sm font-medium", clsA)}>
        {fmtFn(valA)}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground w-36 justify-center">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("text-left tabular-nums text-sm font-medium", clsB)}>
        {fmtFn(valB)}
      </div>
    </div>
  );
}

function BookHeader({ book }: { book: Book }) {
  const title = book.titleTranslated || book.title || "Untitled";
  const author = book.authorTranslated || book.author || "Unknown";
  const genre = book.genreNameTranslated || book.subgenreNameTranslated;
  const statusLabel = book.status === "completed" ? "Completed" : book.status === "ongoing" ? "Ongoing" : null;

  return (
    <Link href={bookUrl(book.id, book.titleTranslated || book.title)} className="group flex flex-col items-center text-center">
      {book.imageUrl ? (
        <Image
          src={book.imageUrl}
          alt={title}
          width={140}
          height={187}
          className="rounded-xl object-cover w-[100px] h-[133px] sm:w-[140px] sm:h-[187px] shadow-md transition-transform group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground w-[100px] h-[133px] sm:w-[140px] sm:h-[187px]">
          No image
        </div>
      )}
      <p className="mt-3 text-sm sm:text-base font-medium leading-tight line-clamp-2 group-hover:underline">{title}</p>
      {book.titleTranslated && book.title && (
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{book.title}</p>
      )}
      <p className="text-xs sm:text-sm text-muted-foreground mt-1">{author}</p>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
        {genre && <Badge variant="secondary" className="text-xs">{genre}</Badge>}
        {statusLabel && <Badge variant="outline" className="text-xs">{statusLabel}</Badge>}
      </div>
    </Link>
  );
}

export function CompareView({ bookA, bookB, statsA, statsB, tagsA, tagsB, overlap }: CompareViewProps) {
  const router = useRouter();

  const handleSwap = () => {
    router.push(`/compare?books=${bookB.id},${bookA.id}`);
  };

  const handleReset = () => {
    router.push("/compare");
  };

  const qqScoreA = bookA.qqScore ? parseFloat(bookA.qqScore) : null;
  const qqScoreB = bookB.qqScore ? parseFloat(bookB.qqScore) : null;

  const positiveA = statsA?.ratingCount ? (statsA.ratingPositive ?? 0) / statsA.ratingCount * 100 : null;
  const positiveB = statsB?.ratingCount ? (statsB.ratingPositive ?? 0) / statsB.ratingCount * 100 : null;

  // Find common tags
  const tagIdsA = new Set(tagsA.map((t) => t.id));
  const commonTagIds = new Set(tagsB.filter((t) => tagIdsA.has(t.id)).map((t) => t.id));

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl sm:text-2xl font-medium">Compare</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSwap}>
            <ArrowRightLeft className="size-3.5" />
            <span className="hidden sm:inline">Swap</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <X className="size-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
        </div>
      </div>

      {/* Book headers */}
      <div className="grid grid-cols-2 gap-4 sm:gap-8 mb-8">
        <BookHeader book={bookA} />
        <BookHeader book={bookB} />
      </div>

      {/* Reader overlap */}
      {overlap > 0 && (
        <div className="flex items-center justify-center gap-2 py-3 mb-6 rounded-lg bg-muted/50 text-sm text-muted-foreground">
          <Users className="size-4" />
          <span><span className="font-medium text-foreground">{overlap}</span> readers read both</span>
        </div>
      )}

      {/* Stats comparison */}
      <div className="rounded-lg border p-4 sm:p-6 mb-8">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Content</p>
        <StatRow label="Words" icon={ScrollText} valA={bookA.wordCount} valB={bookB.wordCount} />
        <StatRow label="Chapters" icon={BookOpen} valA={statsA?.chapterCount} valB={statsB?.chapterCount} />

        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Qidian</p>
        <StatRow label="QQ Score" icon={Star} valA={qqScoreA} valB={qqScoreB} fmtFn={(n) => n != null ? n.toFixed(1) : "—"} />
        <StatRow label="Favorites" icon={Heart} valA={bookA.qqFavoriteCount} valB={bookB.qqFavoriteCount} />
        <StatRow label="Fans" icon={Users} valA={bookA.qqFanCount} valB={bookB.qqFanCount} />
        <StatRow label="Comments" icon={MessageSquareText} valA={statsA?.commentCount} valB={statsB?.commentCount} />

        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Community</p>
        <StatRow label="Readers" icon={Users} valA={statsA?.readerCount} valB={statsB?.readerCount} />
        <StatRow label="Bookmarks" icon={Bookmark} valA={statsA?.bookmarkCount} valB={statsB?.bookmarkCount} />
        <StatRow label="Reviews" icon={MessageSquareText} valA={statsA?.reviewCount} valB={statsB?.reviewCount} />
        <StatRow
          label="Rating"
          icon={Star}
          valA={positiveA}
          valB={positiveB}
          fmtFn={(n) => n != null ? `${Math.round(n)}%` : "—"}
        />
      </div>

      {/* Tags */}
      {(tagsA.length > 0 || tagsB.length > 0) && (
        <div className="rounded-lg border p-4 sm:p-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Community Tags</p>
          <div className="grid grid-cols-2 gap-4 sm:gap-8">
            <div className="flex flex-wrap gap-1.5">
              {tagsA.length > 0 ? tagsA.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={commonTagIds.has(tag.id) ? "default" : "secondary"}
                  className="text-xs"
                >
                  {tag.displayName || tag.name}
                </Badge>
              )) : (
                <span className="text-xs text-muted-foreground">No tags yet</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tagsB.length > 0 ? tagsB.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={commonTagIds.has(tag.id) ? "default" : "secondary"}
                  className="text-xs"
                >
                  {tag.displayName || tag.name}
                </Badge>
              )) : (
                <span className="text-xs text-muted-foreground">No tags yet</span>
              )}
            </div>
          </div>
          {commonTagIds.size > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {commonTagIds.size} shared tag{commonTagIds.size !== 1 ? "s" : ""} highlighted
            </p>
          )}
        </div>
      )}
    </div>
  );
}
