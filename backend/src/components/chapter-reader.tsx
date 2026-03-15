"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { bookUrl as buildBookUrl } from "@/lib/utils";
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
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { translateBatch, translateText } from "@/lib/google-translate";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";

interface SourceChapter {
  title: string;
  title_en: string;
  url: string;
  sequence: number;
}

interface DetectedEntity {
  original: string;
  translated: string;
  gender: string;
  source: string;
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
  const [loadingStatus, setLoadingStatus] = useState("Connecting to source...");
  const [error, setError] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string>(initialSourceUrl);
  const [sourceDomain, setSourceDomain] = useState("");
  const [chapters, setChapters] = useState<SourceChapter[]>([]);
  const [currentSeq, setCurrentSeq] = useState(initialSeq);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterTitleTranslated, setChapterTitleTranslated] = useState("");
  const [chapterContent, setChapterContent] = useState("");
  const [isVip, setIsVip] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastSavedSeq, setLastSavedSeq] = useState<number | null>(null);
  const [jumpPrompt, setJumpPrompt] = useState<{ targetSeq: number; savedTitle: string } | null>(null);
  const savingRef = useRef<number>(0);
  const bookPageUrl = buildBookUrl(bookId, bookTitle);
  const isDesktop = useMediaQuery("(min-width: 640px)");

  // Translation state
  const [translationTier, setTranslationTier] = useState<string>("free");
  const [translatedParagraphs, setTranslatedParagraphs] = useState<string[]>([]);
  const [translationDone, setTranslationDone] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [detectedEntities, setDetectedEntities] = useState<DetectedEntity[]>([]);
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [showEntities, setShowEntities] = useState(false);
  const [retranslateKey, setRetranslateKey] = useState(0);
  const [readerFontSize, setReaderFontSize] = useState(16);
  const [readerLineSpacing, setReaderLineSpacing] = useState(1.75);
  const translationAbortRef = useRef(false);

  // Load reader settings from localStorage + listen for changes
  useEffect(() => {
    const loadSettings = () => {
      setReaderFontSize(Number(localStorage.getItem("reader-font-size")) || 16);
      setReaderLineSpacing(Number(localStorage.getItem("reader-line-spacing")) || 1.75);
    };
    loadSettings();
    window.addEventListener("reader-settings-changed", loadSettings);
    return () => window.removeEventListener("reader-settings-changed", loadSettings);
  }, []);

  // Load user's translation tier on mount
  useEffect(() => {
    fetch("/api/user/translation-settings")
      .then((r) => r.json())
      .then((data) => { if (data.tier) setTranslationTier(data.tier); })
      .catch(() => {});
  }, []);

  const getDomain = (url: string) => {
    try { return new URL(url).hostname; } catch { return ""; }
  };

  // ---------------------------------------------------------------------------
  // Load chapter list (SSE)
  // ---------------------------------------------------------------------------
  const loadChapters = useCallback(async (url: string, refresh = false) => {
    setPhase("loading-chapters");
    setError("");
    const domain = getDomain(url);
    setSourceDomain(domain);
    setLoadingStatus("Connecting to source...");
    try {
      const params = new URLSearchParams({ url, stream: "1" });
      if (refresh) params.set("refresh", "1");
      const res = await fetch(`/api/reader/chapters?${params}`);
      if (!res.ok) throw new Error("Failed");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let result: SourceChapter[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const block of events) {
          const { event, data } = parseSSE(block);
          if (event === "status") setLoadingStatus(data);
          else if (event === "error") { setError(data); setPhase("error"); return []; }
          else if (event === "chapters") result = JSON.parse(data);
        }
      }
      if (!result.length) { setError("No chapters found."); setPhase("error"); return []; }
      setChapters(result);
      return result;
    } catch { setError("Failed to load chapters."); setPhase("error"); return []; }
  }, []);

  // ---------------------------------------------------------------------------
  // Load chapter content
  // ---------------------------------------------------------------------------
  const loadContent = useCallback(async (chapterList: SourceChapter[], seq: number) => {
    setPhase("loading-content");
    setLoadingStatus(`Fetching chapter ${seq}...`);
    setIsVip(false);
    const chapter = chapterList.find((c) => c.sequence === seq)
      || chapterList.reduce((a, b) => Math.abs(b.sequence - seq) < Math.abs(a.sequence - seq) ? b : a);
    if (!chapter) { setError("Chapter not found."); setPhase("error"); return; }
    if (chapter.sequence !== seq) setCurrentSeq(chapter.sequence);
    try {
      const res = await fetch(`/api/reader/chapter?url=${encodeURIComponent(chapter.url)}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setChapterTitle(data.title || chapter.title);
      setChapterContent(data.content);
      setIsVip(data.vip || false);
      setPhase("ready");
      window.scrollTo({ top: 0 });
    } catch { setError("Failed to fetch chapter."); setPhase("error"); }
  }, []);

  // ---------------------------------------------------------------------------
  // Sync progress
  // ---------------------------------------------------------------------------
  const syncProgress = useCallback(async (seq: number, domain: string) => {
    if (status !== "authenticated") return;
    savingRef.current = seq;
    try {
      const seqRes = await fetch(`/api/books/${bookId}/chapter-by-seq?seq=${seq}`);
      const seqData = await seqRes.json();
      if (seqData.id) {
        await Promise.all([
          fetch(`/api/books/${bookId}/progress`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chapterId: seqData.id }),
          }),
          sourceUrl ? fetch(`/api/books/${bookId}/source`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, novelUrl: sourceUrl }),
          }) : Promise.resolve(),
        ]);
        setLastSavedSeq(seq);
        window.dispatchEvent(new CustomEvent("progress-updated", { detail: seq }));
        window.dispatchEvent(new CustomEvent("bookmark-updated", { detail: { bookmarked: true, status: "reading" } }));
      }
    } catch {}
  }, [bookId, sourceUrl, status]);

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const domain = getDomain(initialSourceUrl);
    setSourceDomain(domain);
    (async () => {
      const list = await loadChapters(initialSourceUrl);
      if (cancelled || !list.length) return;
      await loadContent(list, initialSeq);
      syncProgress(initialSeq, domain);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Auto-translate when content loads or retranslate triggered
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!chapterContent || phase !== "ready") return;
    translationAbortRef.current = false;
    setTranslatedParagraphs([]);
    setTranslationDone(false);
    setDetectedEntities([]);
    setChapterTitleTranslated("");
    setTranslating(true);

    // Translate title
    if (chapterTitle) {
      translateText(chapterTitle).then((t) => {
        if (t !== chapterTitle) setChapterTitleTranslated(t);
      });
    }

    const paragraphs = chapterContent.split("\n").filter(Boolean);

    if (translationTier === "free") {
      // Free: client-side GT
      const BATCH = 10;
      const translated: string[] = new Array(paragraphs.length).fill("");
      (async () => {
        for (let i = 0; i < paragraphs.length; i += BATCH) {
          if (translationAbortRef.current) break;
          const result = await translateBatch(paragraphs.slice(i, i + BATCH));
          for (let j = 0; j < result.length; j++) translated[i + j] = result[j];
          setTranslatedParagraphs([...translated]);
        }
        setTranslationDone(true);
        setTranslating(false);
      })();
    } else if (translationTier === "premium" || translationTier === "byok") {
      // AI/BYOK: server-side SSE
      const chunkTexts: Record<number, string> = {};
      (async () => {
        try {
          const params = new URLSearchParams({
            url: chapters.find((c) => c.sequence === currentSeq)?.url || "",
            translate: translationTier === "premium" ? "ai" : "byok",
            stream: "1",
            ...(bookId ? { book_id: String(bookId) } : {}),
          });
          const res = await fetch(`/api/reader/chapter?${params}`);
          if (!res.ok) throw new Error("Failed");
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No stream");
          const decoder = new TextDecoder();
          let buffer = "";
          const translated: string[] = new Array(paragraphs.length).fill("");

          while (true) {
            const { done, value } = await reader.read();
            if (done || translationAbortRef.current) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";
            for (const block of events) {
              const { event, data } = parseSSE(block);
              if (event === "status") setLoadingStatus(data);
              else if (event === "entity") {
                const ent = JSON.parse(data);
                setDetectedEntities((prev) => [...prev, ent]);
              } else if (event === "token") {
                const { chunk_idx, token } = JSON.parse(data);
                chunkTexts[chunk_idx] = (chunkTexts[chunk_idx] || "") + token;
                const paraOffset = chunk_idx * 20;
                const streamParas = chunkTexts[chunk_idx].split("\n").filter((s: string) => s.trim());
                for (let j = 0; j < streamParas.length; j++) {
                  const gi = paraOffset + j;
                  if (gi < translated.length) translated[gi] = streamParas[j].trim();
                }
                setTranslatedParagraphs([...translated]);
              } else if (event === "chunk_done") {
                const chunk = JSON.parse(data);
                for (const p of chunk.paragraphs) {
                  if (p.index < translated.length) translated[p.index] = p.text;
                }
                delete chunkTexts[chunk.chunk_idx];
                setTranslatedParagraphs([...translated]);
              } else if (event === "error") { setTranslating(false); return; }
            }
          }
          setTranslationDone(true);
          setTranslating(false);
        } catch { setTranslating(false); }
      })();
    }
    return () => { translationAbortRef.current = true; };
  }, [chapterContent, phase, translationTier, retranslateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  const goToChapter = useCallback(async (seq: number) => {
    const isNext = seq === currentSeq + 1;
    setCurrentSeq(seq);
    setDrawerOpen(false);
    setJumpPrompt(null);
    if (sourceUrl) router.replace(`/book/${bookId}/read?seq=${seq}&source=${encodeURIComponent(sourceUrl)}`, { scroll: false });
    if (chapters.length) await loadContent(chapters, seq);
    if (isNext) syncProgress(seq, sourceDomain);
    else if (lastSavedSeq != null && seq !== lastSavedSeq) {
      const savedCh = chapters.find((c) => c.sequence === lastSavedSeq);
      setJumpPrompt({ targetSeq: seq, savedTitle: savedCh ? (savedCh.title_en || savedCh.title) : `Ch. ${lastSavedSeq}` });
    } else if (lastSavedSeq == null) syncProgress(seq, sourceDomain);
  }, [bookId, chapters, currentSeq, lastSavedSeq, loadContent, router, sourceDomain, sourceUrl, syncProgress]);

  const retranslate = () => {
    translationAbortRef.current = true;
    setTimeout(() => setRetranslateKey((k) => k + 1), 50);
  };

  const hasPrev = currentSeq > 1;
  const hasNext = chapters.length > 0 && currentSeq < chapters.length;
  const paragraphs = chapterContent ? chapterContent.split("\n").filter(Boolean) : [];

  // ---------------------------------------------------------------------------
  // Loading states
  // ---------------------------------------------------------------------------
  if (phase === "loading-chapters") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{loadingStatus}</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={bookPageUrl}><ArrowLeft className="size-4" />Back</Link>
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

  if (phase === "loading-content") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{loadingStatus}</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Ready — render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      {/* Header — back + novel title + language toggle */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0 size-8" asChild>
          <Link href={bookPageUrl}><ArrowLeft className="size-4" /></Link>
        </Button>
        <Link href={bookPageUrl} className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate flex-1">
          {bookTitle}
        </Link>
        {/* EN / 中文 pill */}
        <div className="flex rounded-md border border-border text-xs overflow-hidden shrink-0">
          <button className={`px-2.5 py-1 transition-colors ${lang === "en" ? "bg-muted font-medium" : "hover:bg-muted/50"}`} onClick={() => setLang("en")}>EN</button>
          <button className={`px-2.5 py-1 transition-colors ${lang === "zh" ? "bg-muted font-medium" : "hover:bg-muted/50"}`} onClick={() => setLang("zh")}>中文</button>
        </div>
      </div>

      {/* Chapter title — centered */}
      <h1 className="text-base sm:text-lg font-medium text-center leading-tight">
        {lang === "en" && chapterTitleTranslated ? chapterTitleTranslated : chapterTitle}
      </h1>

      {/* Chapter nav bar */}
      <div className="flex items-center gap-2 sm:max-w-3xl sm:mx-auto w-full">
        <Button variant="outline" size="sm" className="shrink-0" disabled={!hasPrev} onClick={() => goToChapter(currentSeq - 1)}>
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        <div className="flex-1 flex items-center justify-center gap-1">
          {detectedEntities.length > 0 && (
            <Button variant={showEntities ? "secondary" : "ghost"} size="sm" onClick={() => setShowEntities(!showEntities)}>
              <Sparkles className="size-3.5" />
              <span className="hidden sm:inline">Entities</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={retranslate}>
            <RefreshCw className={`size-3.5 ${translating ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Retranslate</span>
          </Button>
          <div className="w-px h-5 bg-border mx-0.5" />

          <Button variant="ghost" size="sm" className="tabular-nums" onClick={() => setDrawerOpen(true)}>
            <List className="size-3.5" />
            {currentSeq}/{chapters.length}
          </Button>
        </div>

        <Button variant="outline" size="sm" className="shrink-0" disabled={!hasNext} onClick={() => goToChapter(currentSeq + 1)}>
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Translation progress */}
      {translating && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin shrink-0" />
          <span className="truncate">{loadingStatus}</span>
          {translatedParagraphs.some(Boolean) && (
            <span className="tabular-nums">{translatedParagraphs.filter(Boolean).length}/{paragraphs.length}</span>
          )}
        </div>
      )}

      {/* Jump prompt */}
      {jumpPrompt && lastSavedSeq != null && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-muted/30 text-sm">
          <p className="text-muted-foreground truncate min-w-0">Progress at Ch. {lastSavedSeq} — {jumpPrompt.savedTitle}</p>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => { syncProgress(jumpPrompt.targetSeq, sourceDomain); setJumpPrompt(null); }}>
              Save Ch. {jumpPrompt.targetSeq}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setJumpPrompt(null); goToChapter(lastSavedSeq!); }}>
              Go Back
            </Button>
          </div>
        </div>
      )}

      {/* VIP badge */}
      {isVip && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-sm">
          <Lock className="size-3.5 text-amber-500" />
          <span className="text-amber-600 dark:text-amber-400">VIP chapter — content may be truncated.</span>
        </div>
      )}

      {/* Content */}
      <article className="w-full sm:max-w-3xl sm:mx-auto" style={{ fontSize: `${readerFontSize}px`, lineHeight: readerLineSpacing }}>
        {lang === "en" && translationDone ? (
          // Translation complete — show only translated paragraphs (no 1:1 mapping with original)
          translatedParagraphs.filter(Boolean).map((text, i) => (
            <p key={i} className=" text-foreground/90 mb-3 sm:mb-4">
              {showEntities ? highlightEntityNames(text, detectedEntities) : text}
            </p>
          ))
        ) : lang === "en" && translating ? (
          // Translation in progress — show original as muted, replace with translated as they arrive
          paragraphs.map((p, i) => {
            const translated = translatedParagraphs[i];
            const entityPhase = !translatedParagraphs.some(Boolean) && detectedEntities.length > 0;
            if (translated) {
              return (
                <p key={i} className=" text-foreground/90 mb-3 sm:mb-4 animate-in fade-in duration-200">
                  {showEntities ? highlightEntityNames(translated, detectedEntities) : translated}
                </p>
              );
            }
            return (
              <p key={i} className=" text-muted-foreground/50 mb-3 sm:mb-4 transition-colors duration-200">
                {entityPhase && detectedEntities.length > 0 ? highlightOriginalEntities(p, detectedEntities) : p}
              </p>
            );
          })
        ) : (
          // Chinese view or no translation
          paragraphs.map((p, i) => (
            <p key={i} className=" text-foreground/90 mb-3 sm:mb-4">
              {showEntities && detectedEntities.length > 0 ? highlightOriginalEntities(p, detectedEntities) : p}
            </p>
          ))
        )}
      </article>

      {/* Bottom navigation */}
      <nav className="flex items-center justify-between w-full sm:max-w-3xl sm:mx-auto border-t pt-4">
        <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => goToChapter(currentSeq - 1)}>
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">{currentSeq} / {chapters.length}</span>
        <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => goToChapter(currentSeq + 1)}>
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" />
        </Button>
      </nav>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
        <Globe className="size-3 shrink-0" />
        Fetched live from {sourceDomain} — not stored by DaoSearch
      </p>

      {/* Chapter list — Sheet on desktop, Drawer on mobile */}
      {isDesktop ? (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="w-[400px] flex flex-col p-0" showCloseButton={false}>
            <SheetHeader className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-base font-medium">
                  Chapters <span className="text-muted-foreground font-normal ml-1.5">({chapters.length})</span>
                </SheetTitle>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => {
                  setDrawerOpen(false);
                  (async () => { const list = await loadChapters(sourceUrl, true); if (list.length) await loadContent(list, currentSeq); })();
                }}>
                  <RefreshCw className="size-3" />Refresh
                </Button>
              </div>
              {sourceDomain && <p className="text-xs text-muted-foreground">Source: {sourceDomain}</p>}
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-3 pb-6">
              <ChapterList chapters={chapters} currentSeq={currentSeq} onSelect={goToChapter} />
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="pb-2">
              <div className="flex items-center justify-between">
                <DrawerTitle className="text-base font-medium">
                  Chapters <span className="text-muted-foreground font-normal ml-1.5">({chapters.length})</span>
                </DrawerTitle>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => {
                  setDrawerOpen(false);
                  (async () => { const list = await loadChapters(sourceUrl, true); if (list.length) await loadContent(list, currentSeq); })();
                }}>
                  <RefreshCw className="size-3" />Refresh
                </Button>
              </div>
              {sourceDomain && <p className="text-xs text-muted-foreground">Source: {sourceDomain}</p>}
            </DrawerHeader>
            <div className="flex-1 overflow-y-auto px-3 pb-6">
              <ChapterList chapters={chapters} currentSeq={currentSeq} onSelect={goToChapter} />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function ChapterList({ chapters, currentSeq, onSelect }: { chapters: SourceChapter[]; currentSeq: number; onSelect: (seq: number) => void }) {
  return (
    <div>
      {chapters.map((ch) => {
        const isCurrent = ch.sequence === currentSeq;
        return (
          <button key={ch.sequence} onClick={() => onSelect(ch.sequence)}
            className={`flex items-center gap-3 px-2.5 py-2.5 w-full text-left rounded-md transition-colors ${isCurrent ? "bg-accent ring-1 ring-border" : "hover:bg-muted/50"}`}>
            <span className={`text-xs tabular-nums shrink-0 text-right ${isCurrent ? "text-foreground font-medium" : "text-muted-foreground"}`}
              style={{ minWidth: `${String(chapters.length).length}ch` }}>{ch.sequence}</span>
            <span className={`text-sm truncate ${isCurrent ? "font-medium" : ""}`}>{ch.title_en || ch.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function parseSSE(block: string): { event: string; data: string } {
  if (!block.trim()) return { event: "", data: "" };
  const lines = block.split("\n");
  let event = "";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
  }
  return { event, data: dataLines.join("\n") };
}

function highlightOriginalEntities(text: string, entities: DetectedEntity[]): React.ReactNode {
  if (!entities.length) return text;
  const sorted = [...entities].sort((a, b) => b.original.length - a.original.length);
  const escaped = sorted.map((e) => e.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  const map = new Map(entities.map((e) => [e.original, e.translated]));
  return parts.map((part, i) => {
    const t = map.get(part);
    return t ? <span key={i} className="bg-blue-500/10 rounded px-0.5 cursor-help" title={t}>{part}</span> : part;
  });
}

function highlightEntityNames(text: string, entities: DetectedEntity[]): React.ReactNode {
  if (!entities.length) return text;
  const sorted = [...entities].filter((e) => e.translated.length > 1).sort((a, b) => b.translated.length - a.translated.length);
  if (!sorted.length) return text;
  const escaped = sorted.map((e) => e.translated.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  const map = new Map(sorted.map((e) => [e.translated.toLowerCase(), e.original]));
  return parts.map((part, i) => {
    const o = map.get(part.toLowerCase());
    return o ? <span key={i} className="bg-violet-500/10 rounded px-0.5 cursor-help" title={o}>{part}</span> : part;
  });
}
