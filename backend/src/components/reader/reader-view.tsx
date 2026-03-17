"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { translateAllProgressive, translateText, onRateLimitChange } from "@/lib/google-translate";
import { ChapterParagraph } from "@/components/book/chapter-markdown";
import { cleanChapterTitle, extractChapterSeq } from "@/components/reader/utils";

interface ReaderViewProps {
  bookId: number;
  bookTitle: string;
  bookTitleRaw?: string;
  rawTitle: string;
  rawContent: string;
  nextUrl: string | null;
  prevUrl: string | null;
  sourceUrl: string;
  domain: string;
  isAuthenticated: boolean;
  onNavigate: (url: string) => void;
  onBack: () => void;
  prefetchedTranslation?: { paragraphs: string[]; title: string } | null;
  prefetchStatus?: "idle" | "loading" | "ready";
}

const TITLE_LOWER = new Set([
  "a","an","the","and","but","or","nor","for","yet","so",
  "in","on","at","to","by","of","up","as","is","if","it","no",
]);

function titleCase(text: string): string {
  const words = text.split(" ");
  if (!words.length) return text;
  return words
    .map((w, i) =>
      i === 0 || i === words.length - 1 || !TITLE_LOWER.has(w.toLowerCase())
        ? w.charAt(0).toUpperCase() + w.slice(1)
        : w.toLowerCase(),
    )
    .join(" ");
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

// cleanChapterTitle and extractChapterSeq imported from utils

export function ReaderView({
  bookId,
  bookTitle,
  bookTitleRaw,
  rawTitle,
  rawContent,
  nextUrl,
  prevUrl,
  sourceUrl,
  domain,
  isAuthenticated,
  onNavigate,
  onBack,
  prefetchedTranslation,
  prefetchStatus = "idle",
}: ReaderViewProps) {
  const chapterTitle = cleanChapterTitle(rawTitle, bookTitle, bookTitleRaw);
  const chapterSeq = extractChapterSeq(rawTitle);
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [translatedTitle, setTranslatedTitle] = useState("");
  const [translatedParagraphs, setTranslatedParagraphs] = useState<string[]>([]);
  const [translating, setTranslating] = useState(false);
  const [translationDone, setTranslationDone] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [retranslateKey, setRetranslateKey] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState(16);
  const [readerLineSpacing, setReaderLineSpacing] = useState(1.75);
  const [translationTier, setTranslationTier] = useState<string>("free");
  const translationAbortRef = useRef(false);

  const paragraphs = rawContent
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Load reader settings from localStorage
  useEffect(() => {
    const loadSettings = () => {
      setReaderFontSize(Number(localStorage.getItem("reader-font-size")) || 16);
      setReaderLineSpacing(Number(localStorage.getItem("reader-line-spacing")) || 1.75);
    };
    loadSettings();
    window.addEventListener("reader-settings-changed", loadSettings);
    return () => window.removeEventListener("reader-settings-changed", loadSettings);
  }, []);

  // Load translation tier + listen for changes
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/user/translation-settings")
      .then((r) => r.json())
      .then((data) => { if (data.tier) setTranslationTier(data.tier); })
      .catch(() => {});
    const handler = (e: Event) => {
      const tier = (e as CustomEvent).detail?.tier;
      if (tier) setTranslationTier(tier);
    };
    window.addEventListener("translation-settings-changed", handler);
    return () => window.removeEventListener("translation-settings-changed", handler);
  }, [isAuthenticated]);

  // Listen for rate limit changes
  useEffect(() => {
    const unsub = onRateLimitChange(setRateLimited);
    return () => { unsub(); };
  }, []);

  // Sync progress whenever content changes (mount + navigation)
  // rawContent is included to guarantee this fires on every chapter load
  useEffect(() => {
    if (!isAuthenticated || !sourceUrl) return;
    fetch(`/api/books/${bookId}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUrl,
        ...(chapterSeq != null ? { chapterSeq } : {}),
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, sourceUrl, isAuthenticated, chapterSeq, rawContent]);

  // Scroll to top and reset navigating state when content changes
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setNavigating(false);
  }, [rawContent]);

  // Auto-translate (supports free GT + BYOK AI + prefetched)
  useEffect(() => {
    if (!rawContent || paragraphs.length === 0) return;

    // Use prefetched translation if available
    if (prefetchedTranslation?.paragraphs?.some(Boolean)) {
      setTranslatedParagraphs(prefetchedTranslation.paragraphs);
      if (prefetchedTranslation.title) {
        setTranslatedTitle(prefetchedTranslation.title);
        saveTranslatedTitle(prefetchedTranslation.title);
      }
      setTranslationDone(true);
      setTranslating(false);
      return;
    }

    translationAbortRef.current = false;
    setTranslatedParagraphs([]);
    setTranslationDone(false);
    setTranslatedTitle("");
    setTranslating(true);

    if (translationTier === "byok" && isAuthenticated) {
      // ── BYOK AI translation via server SSE ──
      (async () => {
        try {
          const res = await fetch("/api/reader/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookId,
              paragraphs,
              sourceDomain: domain,
              title: chapterTitle,
            }),
          });
          if (!res.ok) {
            // Fallback to GT on error
            console.log("[DaoReader] BYOK failed, falling back to GT");
            translateFreeGT(paragraphs, chapterTitle);
            return;
          }
          const reader = res.body?.getReader();
          if (!reader) { translateFreeGT(paragraphs, chapterTitle); return; }

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
              if (event === "entity") {
                // Entity detected by AI — could display in glossary
              } else if (event === "token") {
                const { chunk_idx, token } = JSON.parse(data);
                // Accumulate tokens for streaming display
                const paraOffset = chunk_idx * 20;
                // We don't have per-chunk text accumulator here, just wait for chunk_done
                void token; void paraOffset;
              } else if (event === "chunk_done") {
                const chunk = JSON.parse(data);
                if (chunk.paragraphs) {
                  for (const p of chunk.paragraphs) {
                    if (p.index < translated.length) translated[p.index] = p.text;
                  }
                  if (!translationAbortRef.current) {
                    setTranslatedParagraphs([...translated]);
                  }
                }
                // Extract title from first chunk
                if (chunk.chunk_idx === 0 && chunk.paragraphs?.[0]) {
                  // Title comes from the API's entity parsing
                }
              } else if (event === "done") {
                // Translation complete
              } else if (event === "error") {
                console.log("[DaoReader] BYOK SSE error:", data);
                break;
              }
            }
          }
          if (!translationAbortRef.current) {
            setTranslationDone(true);
            setTranslating(false);
          }
        } catch {
          // Fallback to GT
          translateFreeGT(paragraphs, chapterTitle);
        }
      })();
    } else {
      // ── Free GT translation ──
      translateFreeGT(paragraphs, chapterTitle);
    }

    return () => {
      translationAbortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawContent, retranslateKey, translationTier]);

  // Save translated title to DB (so "Continue reading" can show it)
  const saveTranslatedTitle = useCallback((translatedTitleText: string) => {
    if (!isAuthenticated || !translatedTitleText) return;
    fetch("/api/reader/save-translation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId,
        chapterSeq: chapterSeq ?? 1,
        translatedTitle: translatedTitleText,
        translatedText: "",
        sourceDomain: domain,
      }),
    }).catch(() => {});
  }, [bookId, domain, isAuthenticated, chapterSeq]);

  // Free GT translation helper
  const translateFreeGT = useCallback((paras: string[], title: string) => {
    // Translate title
    if (title) {
      translateText(title).then((t) => {
        if (!translationAbortRef.current && t !== title) {
          const cleaned = titleCase(t);
          setTranslatedTitle(cleaned);
          saveTranslatedTitle(cleaned);
        }
      });
    }
    // Progressive translation — auto-chunked by character limit
    (async () => {
      await translateAllProgressive(
        paras,
        (translated) => {
          if (!translationAbortRef.current) {
            setTranslatedParagraphs(translated);
          }
        },
        { signal: translationAbortRef.current ? { aborted: true } : { get aborted() { return translationAbortRef.current; } } },
      );
      if (!translationAbortRef.current) {
        setTranslationDone(true);
        setTranslating(false);
      }
    })();
  }, [saveTranslatedTitle]);

  const retranslate = useCallback(() => {
    translationAbortRef.current = true;
    setTimeout(() => setRetranslateKey((k) => k + 1), 50);
  }, []);

  const handleNavigate = useCallback(
    async (url: string) => {
      setNavigating(true);
      translationAbortRef.current = true;
      onNavigate(url);
      // Safety timeout — if parent doesn't update content within 15s, reset
      setTimeout(() => setNavigating(false), 15000);
    },
    [onNavigate],
  );

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-20">
      {/* Back button + book title */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0 size-8" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm text-muted-foreground truncate">{bookTitle}</span>
      </div>

      {/* Chapter title */}
      <h1 className="text-base sm:text-lg font-medium text-center leading-tight">
        {lang === "en" && translatedTitle ? translatedTitle : chapterTitle}
      </h1>

      {/* Language toggle */}
      <div className="flex justify-center">
        <div className="flex rounded-md border border-border text-xs overflow-hidden">
          <button
            className={`px-3 py-1 transition-colors ${lang === "en" ? "bg-foreground text-background font-medium" : "hover:bg-muted/50"}`}
            onClick={() => setLang("en")}
          >
            EN
          </button>
          <button
            className={`px-3 py-1 transition-colors ${lang === "zh" ? "bg-foreground text-background font-medium" : "hover:bg-muted/50"}`}
            onClick={() => setLang("zh")}
          >
            中文
          </button>
        </div>
      </div>

      {/* Retranslate + translation progress */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" size="sm" onClick={retranslate}>
          <RefreshCw className={`size-3.5 ${translating ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Retranslate</span>
        </Button>
        {translating && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin shrink-0" />
            {rateLimited
              ? "Rate limited — waiting to retry..."
              : `Translating... ${translatedParagraphs.filter(Boolean).length}/${paragraphs.length}`}
          </span>
        )}
      </div>

      {/* Content */}
      <article
        className="w-full"
        style={{ fontSize: `${readerFontSize}px`, lineHeight: readerLineSpacing }}
      >
        {lang === "en" && translationDone ? (
          translatedParagraphs
            .filter(Boolean)
            .map((text, i) => (
              <ChapterParagraph key={i} text={text} className="text-foreground/90 mb-3 sm:mb-4" />
            ))
        ) : lang === "en" && translating ? (
          paragraphs.map((p, i) => {
            const translated = translatedParagraphs[i];
            if (translated) {
              return (
                <ChapterParagraph
                  key={i}
                  text={translated}
                  className="text-foreground/90 mb-3 sm:mb-4 animate-in fade-in duration-200"
                />
              );
            }
            return (
              <p key={i} className="text-muted-foreground/50 mb-3 sm:mb-4 transition-colors duration-200">
                {p}
              </p>
            );
          })
        ) : (
          paragraphs.map((p, i) => (
            <p key={i} className="text-foreground/90 mb-3 sm:mb-4">
              {p}
            </p>
          ))
        )}
      </article>

      {/* Sticky bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t z-50">
        <div className="flex items-center justify-between max-w-3xl mx-auto px-4 py-2.5">
          <Button
            variant="outline"
            size="sm"
            disabled={!prevUrl || navigating}
            onClick={() => prevUrl && handleNavigate(prevUrl)}
          >
            {navigating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
            Previous
          </Button>

          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {domain}
            <ExternalLink className="size-3" />
          </a>

          <Button
            variant="outline"
            size="sm"
            className="relative"
            disabled={!nextUrl || navigating}
            onClick={() => nextUrl && handleNavigate(nextUrl)}
          >
            Next
            {navigating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            {prefetchStatus === "ready" && nextUrl && !navigating && (
              <span className="absolute -top-1 -right-1 size-2 rounded-full bg-green-500" title="Next chapter ready" />
            )}
            {prefetchStatus === "loading" && nextUrl && !navigating && (
              <span className="absolute -top-1 -right-1 size-2 rounded-full bg-amber-400 animate-pulse" title="Prefetching..." />
            )}
          </Button>
        </div>
      </nav>
    </div>
  );
}
