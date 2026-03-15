"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { BookOpen, ExternalLink, Loader2, Lock } from "lucide-react";
import { LoginDialog } from "@/components/login-dialog";
import { BookSourcePicker } from "@/components/book-source-picker";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/responsive-dialog";

interface Chapter {
  id: number;
  sequenceNumber: number;
  title: string | null;
  titleTranslated: string | null;
  url: string | null;
  locked?: boolean;
}

interface BookChaptersProps {
  bookId: number;
  initialItems?: Chapter[];
  initialCurrentSeq?: number | null;
  singleColumn?: boolean;
  bookTitleRaw?: string;
  bookUrl?: string;
}

export function BookChapters({ bookId, initialItems, initialCurrentSeq, singleColumn, bookTitleRaw, bookUrl }: BookChaptersProps) {
  const router = useRouter();
  const { status } = useSession();
  const [items, setItems] = useState<Chapter[]>(initialItems ?? []);
  const [loading, setLoading] = useState(!initialItems?.length);
  const [currentSeq, setCurrentSeq] = useState<number | null>(initialCurrentSeq ?? null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pendingSeq, setPendingSeq] = useState<number | null>(null);
  const [pendingChapterId, setPendingChapterId] = useState<number | null>(null);

  useEffect(() => {
    if (initialItems?.length) return;
    setLoading(true);
    fetch(`/api/books/${bookId}/chapters?all=1`)
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookId, initialItems?.length]);

  useEffect(() => {
    const handler = (e: Event) => {
      const seq = (e as CustomEvent<number>).detail;
      if (seq != null) setCurrentSeq(seq);
    };
    window.addEventListener("progress-updated", handler);
    return () => window.removeEventListener("progress-updated", handler);
  }, []);

  const navigateToChapter = useCallback((seq: number, chapterId: number, sourceUrl: string) => {
    setCurrentSeq(seq);
    fetch(`/api/books/${bookId}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId }),
    }).catch(() => {});
    router.push(`/book/${bookId}/read?seq=${seq}&source=${encodeURIComponent(sourceUrl)}`);
  }, [bookId, router]);

  const handleChapterClick = async (ch: Chapter) => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }

    // Try saved source first
    try {
      const res = await fetch(`/api/books/${bookId}/source`);
      const data = await res.json();
      if (data.novelUrl) {
        navigateToChapter(ch.sequenceNumber, ch.id, data.novelUrl);
        return;
      }
    } catch { /* fall through */ }

    // No saved source — open source picker
    setPendingSeq(ch.sequenceNumber);
    setPendingChapterId(ch.id);
    setSourcesOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const maxDigits = items.length > 0
    ? String(items[items.length - 1].sequenceNumber).length
    : 1;

  return (
    <section>
      <div className={singleColumn ? "columns-1" : "columns-1 sm:columns-2 gap-x-2"}>
        {items.map((ch) => {
          const isCurrent = currentSeq != null && ch.sequenceNumber === currentSeq;
          const isRead = currentSeq != null && ch.sequenceNumber < currentSeq;

          return (
            <button
              key={ch.id}
              onClick={() => handleChapterClick(ch)}
              className={`flex items-center gap-3 px-2.5 py-2.5 sm:py-3 w-full text-left rounded-md break-inside-avoid transition-colors ${
                isCurrent
                  ? "bg-accent ring-1 ring-border"
                  : isRead
                    ? "text-muted-foreground/50 hover:bg-muted/30"
                    : "hover:bg-muted/50"
              }`}
            >
              <span
                style={{ minWidth: `${maxDigits}ch` }}
                className={`text-xs sm:text-sm tabular-nums shrink-0 text-right ${
                  isCurrent ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                {ch.sequenceNumber}
              </span>
              <span className={`text-sm sm:text-base truncate ${
                isCurrent ? "text-foreground font-medium" : ""
              }`}>
                {ch.titleTranslated || ch.title || `Chapter ${ch.sequenceNumber}`}
              </span>
              {ch.locked && (
                <Lock className="shrink-0 size-3 text-muted-foreground/40" />
              )}
              {isCurrent && (
                <BookOpen className="ml-auto shrink-0 size-3.5 text-muted-foreground mr-1" />
              )}
              {isRead && !isCurrent && (
                <span className="ml-auto shrink-0 size-1.5 rounded-full bg-muted-foreground/30 mr-1" />
              )}
              {ch.url && (
                <a
                  href={ch.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors ${!isCurrent && !isRead ? "ml-auto" : ""}`}
                >
                  <ExternalLink className="size-3" />
                </a>
              )}
            </button>
          );
        })}
      </div>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <ResponsiveDialog open={sourcesOpen} onOpenChange={setSourcesOpen} className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Sources</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Choose where to read from</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="mt-4">
          <BookSourcePicker
            bookId={bookId}
            bookTitleRaw={bookTitleRaw || ""}
            bookUrl={bookUrl}
            onSelect={(url) => {
              setSourcesOpen(false);
              if (pendingSeq != null && pendingChapterId != null) {
                navigateToChapter(pendingSeq, pendingChapterId, url);
              }
            }}
          />
        </div>
      </ResponsiveDialog>
    </section>
  );
}
