"use client";

import { useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ScrollText, Star } from "lucide-react";
import { bookUrl } from "@/lib/utils";

interface RecommendedBook {
  id: number;
  imageUrl: string | null;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  wordCount: number | null;
  qqScore: string | null;
  commentCount: number;
  reviewCount: number;
  ratingCount: number;
  ratingPositive: number;
  ratingNeutral: number;
  ratingNegative: number;
}

function formatWordCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return count.toString();
}

function qqScoreColor(score: string): string {
  const n = parseFloat(score);
  if (n >= 8) return "text-green-600 dark:text-green-500";
  if (n >= 5) return "text-amber-500";
  return "text-red-500";
}

export function BookRecommendations({ books }: { books: RecommendedBook[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const moved = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragging.current = true;
    moved.current = false;
    startX.current = e.pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
    el.style.cursor = "grabbing";
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = x - startX.current;
    if (Math.abs(walk) > 3) moved.current = true;
    el.scrollLeft = scrollLeft.current - walk;
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    const el = scrollRef.current;
    if (el) el.style.cursor = "grab";
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (moved.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  if (books.length === 0) return null;

  return (
    <section>
      <h2 className="text-base sm:text-lg font-medium mb-4">
        You Might Also Like
      </h2>
      <div className="-mx-4 sm:-mx-0">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-0 pb-2 cursor-grab select-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {books.map((book) => {
            const displayTitle = book.titleTranslated || book.title || "Untitled";
            const displayAuthor = book.authorTranslated || book.author || "Unknown";

            return (
              <Link
                key={book.id}
                href={bookUrl(book.id, book.titleTranslated)}
                className="block shrink-0 w-[110px] sm:w-[140px] group"
                onClickCapture={onClickCapture}
                draggable={false}
              >
                {book.imageUrl ? (
                  <Image
                    src={book.imageUrl}
                    alt={displayTitle}
                    width={140}
                    height={196}
                    className="rounded-lg object-cover w-[110px] h-[154px] sm:w-[140px] sm:h-[196px] group-hover:opacity-80 transition-opacity pointer-events-none"
                    draggable={false}
                  />
                ) : (
                  <div className="flex w-[110px] h-[154px] sm:w-[140px] sm:h-[196px] items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                    No cover
                  </div>
                )}
                <div className="mt-2 min-w-0">
                  <p className="text-sm font-medium line-clamp-2 leading-tight min-h-[2.5em]">{displayTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 text-center">{displayAuthor}</p>
                  <div className="flex items-center justify-center gap-2 mt-1 text-xs text-muted-foreground">
                    {(book.wordCount ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <ScrollText className="size-3 shrink-0" />
                        <span className="tabular-nums">{formatWordCount(book.wordCount!)}</span>
                      </span>
                    )}
                    {book.qqScore && parseFloat(book.qqScore) > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="size-3 shrink-0" />
                        <span className={`tabular-nums ${qqScoreColor(book.qqScore)}`}>{book.qqScore}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
