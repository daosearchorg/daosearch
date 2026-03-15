"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  List,
  ArrowLeft,
  AlertCircle,
  Globe,
  Lock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/responsive-dialog";
import { BookSourcePicker } from "@/components/book-source-picker";

interface SourceChapter {
  title: string;
  url: string;
  sequence: number;
}

interface ChapterReaderProps {
  bookId: number;
  bookTitle: string;
  bookTitleRaw: string;
  bookUrl: string;
  initialSeq: number;
  initialSourceUrl: string;
}

type Phase = "loading-chapters" | "loading-content" | "ready" | "error";

export function ChapterReader({
  bookId,
  bookTitle,
  bookTitleRaw,
  bookUrl,
  initialSeq,
  initialSourceUrl,
}: ChapterReaderProps) {
  const router = useRouter();
  const { status } = useSession();
  const [phase, setPhase] = useState<Phase>("loading-chapters");
  const [error, setError] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string>(initialSourceUrl);
  const [sourceDomain, setSourceDomain] = useState("");
  const [chapters, setChapters] = useState<SourceChapter[]>([]);
  const [currentSeq, setCurrentSeq] = useState(initialSeq);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterContent, setChapterContent] = useState("");
  const [isVip, setIsVip] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [lastSavedSeq, setLastSavedSeq] = useState<number | null>(null);
  const [jumpPrompt, setJumpPrompt] = useState<{ targetSeq: number } | null>(null);
  const savingRef = useRef(false);

  // Extract domain from URL
  const getDomain = (url: string) => {
    try { return new URL(url).hostname; } catch { return ""; }
  };

  // Load chapter list from source
  const loadChapters = useCallback(async (url: string) => {
    setPhase("loading-chapters");
    setError("");
    const domain = getDomain(url);
    setSourceDomain(domain);
    try {
      const res = await fetch(`/api/reader/chapters?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error("Failed to load chapters");
      const list: SourceChapter[] = await res.json();
      if (!list.length) {
        setError("No chapters found at this source.");
        setPhase("error");
        return [];
      }
      setChapters(list);
      return list;
    } catch {
      setError("Failed to load chapter list.");
      setPhase("error");
      return [];
    }
  }, []);

  // Load chapter content
  const loadContent = useCallback(async (chapterList: SourceChapter[], seq: number) => {
    setPhase("loading-content");
    setIsVip(false);
    const chapter = chapterList.find((c) => c.sequence === seq);
    if (!chapter) {
      const closest = chapterList.reduce((prev, curr) =>
        Math.abs(curr.sequence - seq) < Math.abs(prev.sequence - seq) ? curr : prev
      );
      if (closest) {
        setCurrentSeq(closest.sequence);
        return loadContent(chapterList, closest.sequence);
      }
      setError(`Chapter ${seq} not found.`);
      setPhase("error");
      return;
    }
    try {
      const res = await fetch(`/api/reader/chapter?url=${encodeURIComponent(chapter.url)}`);
      if (!res.ok) throw new Error("Failed to load chapter");
      const data = await res.json();
      setChapterTitle(data.title || chapter.title);
      setChapterContent(data.content);
      setIsVip(data.vip || false);
      setPhase("ready");
      window.scrollTo({ top: 0 });
    } catch {
      setError("Failed to fetch chapter content.");
      setPhase("error");
    }
  }, []);

  // Sync progress to Qidian chapter
  const syncProgress = useCallback(async (seq: number, domain: string) => {
    if (status !== "authenticated" || savingRef.current) return;
    savingRef.current = true;
    try {
      // Look up Qidian chapter ID by sequence
      const seqRes = await fetch(`/api/books/${bookId}/chapter-by-seq?seq=${seq}`);
      const seqData = await seqRes.json();
      if (seqData.id) {
        // Save progress
        await fetch(`/api/books/${bookId}/progress`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterId: seqData.id }),
        });
        // Save source
        if (sourceUrl) {
          await fetch(`/api/books/${bookId}/source`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, novelUrl: sourceUrl }),
          });
        }
        setLastSavedSeq(seq);
        window.dispatchEvent(new CustomEvent("progress-updated", { detail: seq }));
        window.dispatchEvent(new CustomEvent("bookmark-updated", {
          detail: { bookmarked: true, status: "reading" },
        }));
      }
    } catch { /* silent */ }
    savingRef.current = false;
  }, [bookId, sourceUrl, status]);

  // Source selected — start loading
  const handleSourceSelect = useCallback(async (url: string, domain: string) => {
    setSourceUrl(url);
    setSourceDomain(domain);
    router.replace(`/book/${bookId}/read?seq=${currentSeq}&source=${encodeURIComponent(url)}`, { scroll: false });
    const list = await loadChapters(url);
    if (list.length) {
      await loadContent(list, currentSeq);
      syncProgress(currentSeq, domain);
    }
  }, [bookId, currentSeq, loadChapters, loadContent, router, syncProgress]);

  // Init: start loading immediately
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const domain = getDomain(initialSourceUrl);
      setSourceDomain(domain);
      const list = await loadChapters(initialSourceUrl);
      if (cancelled || !list.length) return;
      await loadContent(list, initialSeq);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to chapter
  const goToChapter = useCallback(async (seq: number) => {
    const isNext = seq === currentSeq + 1;
    const isPrev = seq === currentSeq - 1;

    setCurrentSeq(seq);
    setDrawerOpen(false);
    setJumpPrompt(null);

    if (sourceUrl) {
      router.replace(`/book/${bookId}/read?seq=${seq}&source=${encodeURIComponent(sourceUrl)}`, { scroll: false });
    }

    if (chapters.length) {
      await loadContent(chapters, seq);
    }

    // Auto-save on "Next", prompt on non-sequential jumps
    if (isNext && sourceDomain) {
      syncProgress(seq, sourceDomain);
    } else if (!isNext && !isPrev && lastSavedSeq != null && lastSavedSeq !== seq) {
      setJumpPrompt({ targetSeq: seq });
    }
  }, [bookId, chapters, currentSeq, lastSavedSeq, loadContent, router, sourceDomain, sourceUrl, syncProgress]);

  const hasPrev = currentSeq > 1;
  const hasNext = chapters.length > 0 && currentSeq < chapters.length;

  // Loading chapters
  if (phase === "loading-chapters") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Fetching chapters from {sourceDomain || "source"}...
        </p>
      </div>
    );
  }

  // Error state
  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/book/${bookId}`}><ArrowLeft className="size-4" />Back</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            (async () => {
              const list = chapters.length ? chapters : await loadChapters(sourceUrl);
              if (list.length) await loadContent(list, currentSeq);
            })();
          }}>
            <RefreshCw className="size-4" />Retry
          </Button>
        </div>
      </div>
    );
  }

  // Loading content — skeleton
  if (phase === "loading-content") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href={`/book/${bookId}`}><ArrowLeft className="size-4" /></Link>
          </Button>
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-32 mb-1.5" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-9/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Fetching chapter {currentSeq} from {sourceDomain}...
        </p>
      </div>
    );
  }

  // Ready — show content
  const paragraphs = chapterContent.split("\n").filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link href={`/book/${bookId}`}><ArrowLeft className="size-4" /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <Link href={`/book/${bookId}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate block">
            {bookTitle}
          </Link>
          <h1 className="text-lg font-medium truncate">{chapterTitle}</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            {currentSeq} / {chapters.length}
          </span>

          {/* Source switcher */}
          <Button variant="ghost" size="icon" title="Switch source" onClick={() => setSourceDrawerOpen(true)}>
            <Globe className="size-4" />
          </Button>
          <ResponsiveDialog open={sourceDrawerOpen} onOpenChange={setSourceDrawerOpen} className="sm:max-w-lg">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>Switch Source</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>Choose a different source to read from</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="mt-4">
              <BookSourcePicker
                bookId={bookId}
                bookTitleRaw={bookTitleRaw}
                bookUrl={bookUrl}
                onSelect={(url, domain) => {
                  setSourceDrawerOpen(false);
                  handleSourceSelect(url, domain);
                }}
              />
            </div>
          </ResponsiveDialog>

          {/* Chapter drawer */}
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon"><List className="size-4" /></Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85vh]">
              <DrawerHeader className="pb-2">
                <DrawerTitle className="text-base font-medium">
                  Chapters
                  <span className="text-muted-foreground font-normal ml-1.5">({chapters.length})</span>
                </DrawerTitle>
                {sourceDomain && (
                  <p className="text-xs text-muted-foreground">Source: {sourceDomain}</p>
                )}
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto px-3 pb-6">
                {chapters.map((ch) => {
                  const isCurrent = ch.sequence === currentSeq;
                  return (
                    <button
                      key={ch.sequence}
                      onClick={() => goToChapter(ch.sequence)}
                      className={`flex items-center gap-3 px-2.5 py-2.5 w-full text-left rounded-md transition-colors ${
                        isCurrent ? "bg-accent ring-1 ring-border" : "hover:bg-muted/50"
                      }`}
                    >
                      <span
                        className={`text-xs tabular-nums shrink-0 text-right ${
                          isCurrent ? "text-foreground font-medium" : "text-muted-foreground"
                        }`}
                        style={{ minWidth: `${String(chapters.length).length}ch` }}
                      >
                        {ch.sequence}
                      </span>
                      <span className={`text-sm truncate ${isCurrent ? "font-medium" : ""}`}>
                        {ch.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      {/* Jump prompt */}
      {jumpPrompt && lastSavedSeq != null && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/60 bg-muted/30 text-sm">
          <span className="text-muted-foreground">
            Progress saved at Ch. {lastSavedSeq}
          </span>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => {
              syncProgress(jumpPrompt.targetSeq, sourceDomain);
              setJumpPrompt(null);
            }}>
              Update to Ch. {jumpPrompt.targetSeq}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setJumpPrompt(null)}>
              Keep
            </Button>
          </div>
        </div>
      )}

      {/* VIP badge */}
      {isVip && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-sm">
          <Lock className="size-3.5 text-amber-500" />
          <span className="text-amber-600 dark:text-amber-400">
            VIP chapter — content may be truncated. Try a different source for full content.
          </span>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Globe className="size-3 shrink-0" />
        Fetched live from {sourceDomain} — not stored by DaoSearch
      </p>

      {/* Content */}
      <article className="max-w-3xl mx-auto w-full">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-base sm:text-lg leading-relaxed sm:leading-loose text-foreground/90 mb-4 sm:mb-5">
            {p}
          </p>
        ))}
      </article>

      {/* Navigation */}
      <nav className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" disabled={!hasPrev} onClick={() => goToChapter(currentSeq - 1)}>
          <ChevronLeft className="size-4" />Previous
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          {currentSeq} / {chapters.length}
        </span>
        <Button variant="outline" disabled={!hasNext} onClick={() => goToChapter(currentSeq + 1)}>
          Next<ChevronRight className="size-4" />
        </Button>
      </nav>
    </div>
  );
}
