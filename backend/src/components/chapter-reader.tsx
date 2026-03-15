"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  List,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface SourceChapter {
  title: string;
  url: string;
  sequence: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

interface ChapterReaderProps {
  bookId: number;
  bookTitle: string;
  bookTitleRaw: string;
  initialSeq: number;
}

type Phase = "searching" | "loading-chapters" | "loading-content" | "ready" | "error";

export function ChapterReader({
  bookId,
  bookTitle,
  bookTitleRaw,
  initialSeq,
}: ChapterReaderProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("searching");
  const [error, setError] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceDomain, setSourceDomain] = useState("");
  const [chapters, setChapters] = useState<SourceChapter[]>([]);
  const [currentSeq, setCurrentSeq] = useState(initialSeq);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterContent, setChapterContent] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Step 1: Search for source
  const discoverSource = useCallback(async () => {
    setPhase("searching");
    setError("");
    try {
      const res = await fetch(
        `/api/reader/search?q=${encodeURIComponent(bookTitleRaw)}`
      );
      if (!res.ok) throw new Error("Search failed");
      const results: SearchResult[] = await res.json();
      if (!results.length) {
        setError("No external sources found for this book.");
        setPhase("error");
        return null;
      }
      const best = results[0];
      setSourceUrl(best.url);
      setSourceDomain(best.domain);
      return best.url;
    } catch {
      setError("Failed to search for sources. Is the reader service running?");
      setPhase("error");
      return null;
    }
  }, [bookTitleRaw]);

  // Step 2: Load chapter list from source
  const loadChapters = useCallback(
    async (url: string) => {
      setPhase("loading-chapters");
      try {
        const res = await fetch(
          `/api/reader/chapters?url=${encodeURIComponent(url)}`
        );
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
        setError("Failed to load chapter list from source.");
        setPhase("error");
        return [];
      }
    },
    []
  );

  // Step 3: Load chapter content
  const loadContent = useCallback(
    async (chapterList: SourceChapter[], seq: number) => {
      setPhase("loading-content");
      const chapter = chapterList.find((c) => c.sequence === seq);
      if (!chapter) {
        // Try closest available
        const closest = chapterList.reduce((prev, curr) =>
          Math.abs(curr.sequence - seq) < Math.abs(prev.sequence - seq)
            ? curr
            : prev
        );
        if (closest) {
          setCurrentSeq(closest.sequence);
          return loadContent(chapterList, closest.sequence);
        }
        setError(`Chapter ${seq} not found in source.`);
        setPhase("error");
        return;
      }
      try {
        const res = await fetch(
          `/api/reader/chapter?url=${encodeURIComponent(chapter.url)}`
        );
        if (!res.ok) throw new Error("Failed to load chapter");
        const data = await res.json();
        setChapterTitle(data.title || chapter.title);
        setChapterContent(data.content);
        setPhase("ready");
        window.scrollTo({ top: 0 });
      } catch {
        setError("Failed to load chapter content.");
        setPhase("error");
      }
    },
    []
  );

  // Init: discover → chapters → content
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await discoverSource();
      if (cancelled || !url) return;
      const list = await loadChapters(url);
      if (cancelled || !list.length) return;
      await loadContent(list, initialSeq);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookTitleRaw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to a different chapter
  const goToChapter = useCallback(
    async (seq: number) => {
      setCurrentSeq(seq);
      setDrawerOpen(false);
      router.replace(`/book/${bookId}/read?seq=${seq}`, { scroll: false });
      if (chapters.length) {
        await loadContent(chapters, seq);
      }
    },
    [bookId, chapters, loadContent, router]
  );

  const hasPrev = currentSeq > 1;
  const hasNext = chapters.length > 0 && currentSeq < chapters.length;

  // Loading states
  if (phase === "searching" || phase === "loading-chapters") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {phase === "searching"
            ? "Finding sources..."
            : "Loading chapter list..."}
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/book/${bookId}`}>
              <ArrowLeft className="size-4" />
              Back to Book
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              (async () => {
                const url = sourceUrl || (await discoverSource());
                if (!url) return;
                const list = chapters.length
                  ? chapters
                  : await loadChapters(url);
                if (list.length) await loadContent(list, currentSeq);
              })();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "loading-content") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading chapter...</p>
      </div>
    );
  }

  const paragraphs = chapterContent.split("\n").filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link href={`/book/${bookId}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <Link
            href={`/book/${bookId}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate block"
          >
            {bookTitle}
          </Link>
          <h1 className="text-lg font-medium truncate">{chapterTitle}</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">
            {currentSeq} / {chapters.length}
          </span>
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon">
                <List className="size-4" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85vh]">
              <DrawerHeader className="pb-2">
                <DrawerTitle className="text-base font-medium">
                  Chapters
                  <span className="text-muted-foreground font-normal ml-1.5">
                    ({chapters.length})
                  </span>
                </DrawerTitle>
                {sourceDomain && (
                  <p className="text-xs text-muted-foreground">
                    Source: {sourceDomain}
                  </p>
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
                        isCurrent
                          ? "bg-accent ring-1 ring-border"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <span
                        className={`text-xs tabular-nums shrink-0 text-right ${
                          isCurrent
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                        }`}
                        style={{
                          minWidth: `${String(chapters.length).length}ch`,
                        }}
                      >
                        {ch.sequence}
                      </span>
                      <span
                        className={`text-sm truncate ${
                          isCurrent ? "font-medium" : ""
                        }`}
                      >
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

      {/* Content */}
      <article ref={contentRef} className="max-w-3xl mx-auto">
        {paragraphs.map((p, i) => (
          <p
            key={i}
            className="text-base sm:text-lg leading-relaxed sm:leading-loose text-foreground/90 mb-4 sm:mb-5"
          >
            {p}
          </p>
        ))}
      </article>

      {/* Navigation */}
      <nav className="flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          disabled={!hasPrev}
          onClick={() => goToChapter(currentSeq - 1)}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          {currentSeq} / {chapters.length}
        </span>
        <Button
          variant="outline"
          disabled={!hasNext}
          onClick={() => goToChapter(currentSeq + 1)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </nav>
    </div>
  );
}
