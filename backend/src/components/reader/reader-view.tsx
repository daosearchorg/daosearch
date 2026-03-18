"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
  BookType,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { translateAllProgressive, translateText, onRateLimitChange } from "@/lib/google-translate";
import { ChapterParagraph, SystemBlockGroup, groupParagraphs } from "@/components/book/chapter-markdown";
import { cleanChapterTitle, extractChapterSeq } from "@/components/reader/utils";
import { EntityDialog, type EntityData } from "@/components/reader/entity-dialog";

// ─── Types ───────────────────────────────────────────────────

interface DetectedEntity {
  original: string;
  translated: string;
  gender: string;
  source: string;
}

interface ReaderViewProps {
  bookId: number | null;
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
  prefetchedTranslation?: { paragraphs: string[]; title: string; entities?: { original: string; translated: string; gender: string; source: string }[] } | null;
  prefetchStatus?: "idle" | "loading" | "ready";
}

// ─── Helpers ─────────────────────────────────────────────────

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

function estimateReadingTime(text: string, isTranslated: boolean): number {
  if (isTranslated) {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 250));
  }
  return Math.max(1, Math.round(text.length / 500));
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
    if (!t) return part;
    const ent = entities.find((e) => e.original === part);
    return (
      <span key={i} className="bg-foreground/8 rounded-sm px-0.5 cursor-help relative group">
        {part}
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1.5 rounded-md bg-popover border border-border shadow-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
          <span className="font-medium">{t}</span>
          {ent?.gender && ent.gender !== "N" && (
            <span className="ml-1.5 text-muted-foreground">{ent.gender === "M" ? "Male" : "Female"}</span>
          )}
        </span>
      </span>
    );
  });
}

// ─── Selection Copy ──────────────────────────────────────────

function useSelectionCopy(bookTitle: string) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleUp = () => {
      // Small delay to let selection finalize
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim();
        if (!text || text.length < 3) { setTooltip(null); return; }
        try {
          const range = sel?.getRangeAt(0);
          if (!range) return;
          const rect = range.getBoundingClientRect();
          setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, text });
          setCopied(false);
        } catch {
          setTooltip(null);
        }
      }, 10);
    };
    const handleDown = (e: MouseEvent) => {
      // Don't dismiss if clicking inside the copy tooltip
      const target = e.target as HTMLElement;
      if (target.closest("[data-sel-tooltip]")) return;
      setTooltip(null);
    };
    document.addEventListener("mouseup", handleUp);
    document.addEventListener("mousedown", handleDown);
    return () => {
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("mousedown", handleDown);
    };
  }, []);

  const handleCopy = useCallback(() => {
    if (!tooltip) return;
    const attribution = `\n— ${bookTitle} (via DaoSearch)`;
    navigator.clipboard.writeText(`"${tooltip.text}"${attribution}`).then(() => {
      setCopied(true);
      setTimeout(() => { setTooltip(null); setCopied(false); }, 1200);
    });
  }, [tooltip, bookTitle]);

  return { tooltip, copied, handleCopy };
}

// ─── Component ───────────────────────────────────────────────

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
  const [lang, setLang] = useState<"en" | "zh">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("reader-lang");
      if (saved === "en" || saved === "zh") return saved;
    }
    return "en";
  });
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
  const [tierLoaded, setTierLoaded] = useState(!isAuthenticated); // if not authenticated, tier is always "free" — loaded immediately
  const [detectedEntities, setDetectedEntities] = useState<DetectedEntity[]>([]);
  const [showEntities, setShowEntities] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntityData | null>(null);
  const [translationStatus, setTranslationStatus] = useState("");
  const [translationProgress, setTranslationProgress] = useState(0); // 0-1
  const translationAbortRef = useRef(false);
  const skipCacheRef = useRef(false);
  const tokenUpdateRef = useRef<number | null>(null);
  const translatedContentRef = useRef<{ content: string; tier: string } | null>(null); // tracks what was already translated
  const articleRef = useRef<HTMLElement>(null);
  const lastTapRef = useRef(0);

  const paragraphs = rawContent
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Reading time
  const displayedContent = lang === "en" && translationDone
    ? translatedParagraphs.filter(Boolean).join(" ")
    : rawContent;
  const readingMinutes = estimateReadingTime(displayedContent, lang === "en" && translationDone);

  // Persist language preference
  useEffect(() => {
    localStorage.setItem("reader-lang", lang);
  }, [lang]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && prevUrl && !navigating) {
        e.preventDefault();
        handleNavigate(prevUrl);
      } else if (e.key === "ArrowRight" && nextUrl && !navigating) {
        e.preventDefault();
        handleNavigate(nextUrl);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevUrl, nextUrl, navigating]); // eslint-disable-line react-hooks/exhaustive-deps

  // Double-tap to toggle language (mobile) — passive listener, no preventDefault
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const handleTap = () => {
      const now = Date.now();
      if (now - lastTapRef.current < 350) {
        setLang((l) => l === "en" ? "zh" : "en");
      }
      lastTapRef.current = now;
    };
    el.addEventListener("touchend", handleTap, { passive: true });
    return () => el.removeEventListener("touchend", handleTap);
  }, []);

  // Update browser tab title
  useEffect(() => {
    const displayTitle = lang === "en" && translatedTitle ? translatedTitle : chapterTitle;
    if (displayTitle) document.title = `${displayTitle} — ${bookTitle}`;
    return () => { document.title = "DaoSearch"; };
  }, [chapterTitle, translatedTitle, bookTitle, lang]);

  // Selection copy
  const { tooltip: selTooltip, copied: selCopied, handleCopy: handleSelCopy } = useSelectionCopy(bookTitle);

  // Load reader settings
  useEffect(() => {
    const loadSettings = () => {
      setReaderFontSize(Number(localStorage.getItem("reader-font-size")) || 16);
      setReaderLineSpacing(Number(localStorage.getItem("reader-line-spacing")) || 1.75);
    };
    loadSettings();
    window.addEventListener("reader-settings-changed", loadSettings);
    return () => window.removeEventListener("reader-settings-changed", loadSettings);
  }, []);

  // Load translation tier
  useEffect(() => {
    if (!isAuthenticated) { setTierLoaded(true); return; }
    fetch("/api/user/translation-settings")
      .then((r) => r.json())
      .then((data) => { if (data.tier) setTranslationTier(data.tier); })
      .catch(() => {})
      .finally(() => setTierLoaded(true));
    const handler = (e: Event) => {
      const tier = (e as CustomEvent).detail?.tier;
      if (tier) setTranslationTier(tier);
    };
    window.addEventListener("translation-settings-changed", handler);
    return () => window.removeEventListener("translation-settings-changed", handler);
  }, [isAuthenticated]);

  useEffect(() => {
    const unsub = onRateLimitChange(setRateLimited);
    return () => { unsub(); };
  }, []);

  // Sync progress
  useEffect(() => {
    if (!bookId || !isAuthenticated || !sourceUrl) return;
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

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setNavigating(false);
  }, [rawContent]);

  // Save full translation to DB when done
  useEffect(() => {
    if (!translationDone || !bookId || !isAuthenticated || !sourceUrl) return;
    // Don't re-save cached translations
    if (translatedContentRef.current?.tier === "cached") return;
    const text = translatedParagraphs.filter(Boolean).join("\n");
    if (!text) return;
    fetch("/api/reader/save-translation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId,
        chapterSeq: chapterSeq ?? null,
        sourceUrl,
        translatedTitle: translatedTitle || null,
        translatedText: text,
        sourceDomain: domain,
        entities: detectedEntities.map((e) => ({ original: e.original, translated: e.translated })),
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationDone]);

  // Auto-translate — wait for tier to load before starting
  useEffect(() => {
    if (!rawContent || paragraphs.length === 0 || !tierLoaded) return;

    // Use prefetched/cached translation if available
    if (prefetchedTranslation?.paragraphs?.some(Boolean)) {
      translatedContentRef.current = { content: rawContent, tier: translationTier };
      setTranslatedParagraphs(prefetchedTranslation.paragraphs);
      setDetectedEntities(prefetchedTranslation.entities || []);
      setTranslationStatus("");
      setTranslationProgress(0);
      if (prefetchedTranslation.title) {
        setTranslatedTitle(prefetchedTranslation.title);
        saveTranslatedTitle(prefetchedTranslation.title);
      }
      setTranslationDone(true);
      setTranslating(false);
      return;
    }

    // Don't re-translate if this content was already translated with the same tier
    if (translatedContentRef.current?.content === rawContent && translatedContentRef.current?.tier === translationTier) return;

    // Try DB cache first, then fall back to fresh translation
    let cacheChecked = false;
    const shouldSkipCache = skipCacheRef.current;
    skipCacheRef.current = false;
    if (bookId && isAuthenticated && sourceUrl && !shouldSkipCache) {
      cacheChecked = true;
      setTranslating(true);
      setTranslationStatus("Checking for saved translation...");

      // Race cache check against a 2s timeout
      const cachePromise = fetch(`/api/reader/cached-chapters?bookId=${bookId}&url=${encodeURIComponent(sourceUrl)}`)
        .then((res) => res.ok ? res.json() : null)
        .catch(() => null);
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));

      Promise.race([cachePromise, timeoutPromise]).then((cached) => {
        if (translationAbortRef.current) return;
        if (cached?.translatedText) {
          const cachedParas = cached.translatedText.split("\n").filter(Boolean);
          if (cachedParas.length > 0) {
            translatedContentRef.current = { content: rawContent, tier: "cached" };
            setTranslatedParagraphs(cachedParas);
            if (cached.translatedTitle) setTranslatedTitle(cached.translatedTitle);
            if (Array.isArray(cached.entities)) {
              setDetectedEntities(cached.entities.map((e: { original: string; translated: string; gender: string; source: string }) => ({
                original: e.original,
                translated: e.translated,
                gender: e.gender || "N",
                source: e.source || "book",
              })));
            }
            setTranslationDone(true);
            setTranslating(false);
            setTranslationStatus("");
            return;
          }
        }
        doTranslate();
      });
    }

    if (!cacheChecked) doTranslate();

    function doTranslate() {
    translationAbortRef.current = false;
    setTranslatedParagraphs([]);
    setTranslationDone(false);
    setTranslatedTitle("");
    setDetectedEntities([]);
    setTranslationStatus("");
    setTranslationProgress(0);
    setTranslating(true);

    if (translationTier === "premium" || (translationTier === "byok" && isAuthenticated)) {
      const chunkTexts: Record<number, string> = {};
      // Track chunk start offsets from chunk_done events (not hardcoded)
      const chunkOffsets: Record<number, number> = {};
      const seenEntityOriginals = new Set<string>();
      let tokenDirty = false;
      (async () => {
        try {
          const res = await fetch("/api/reader/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paragraphs,
              bookId: bookId || undefined,
              sourceDomain: domain,
              title: chapterTitle,
              tier: translationTier,
            }),
          });
          if (!res.ok) throw new Error("Failed");
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No stream");
          const decoder = new TextDecoder();
          let buffer = "";
          const translated: string[] = new Array(paragraphs.length).fill("");

          // Throttled token render — batch updates via rAF
          const flushTokens = () => {
            if (tokenDirty && !translationAbortRef.current) {
              setTranslatedParagraphs([...translated]);
              tokenDirty = false;
            }
            tokenUpdateRef.current = null;
          };
          const scheduleTokenFlush = () => {
            if (tokenUpdateRef.current === null) {
              tokenUpdateRef.current = requestAnimationFrame(flushTokens);
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done || translationAbortRef.current) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";
            for (const block of events) {
              const { event, data } = parseSSE(block);
              if (event === "status") {
                setTranslationStatus(data);
              } else if (event === "entity") {
                const ent = JSON.parse(data);
                seenEntityOriginals.add(ent.original);
                setDetectedEntities((prev) => {
                  // Only add if not already in state (dedup)
                  if (prev.some((e) => e.original === ent.original)) return prev;
                  return [...prev, ent];
                });
                setTranslationStatus(`Detecting entities... ${seenEntityOriginals.size} found`);
              } else if (event === "token") {
                const { chunk_idx, token } = JSON.parse(data);
                chunkTexts[chunk_idx] = (chunkTexts[chunk_idx] || "") + token;
                // Use known offset from previous chunk_done, or estimate from chunk_idx * 25
                const paraOffset = chunkOffsets[chunk_idx] ?? chunk_idx * 25;
                const streamParas = chunkTexts[chunk_idx].split("\n").filter((s: string) => s.trim());
                for (let j = 0; j < streamParas.length; j++) {
                  const gi = paraOffset + j;
                  if (gi < translated.length) translated[gi] = streamParas[j].trim();
                }
                tokenDirty = true;
                scheduleTokenFlush();
              } else if (event === "chunk_done") {
                const chunk = JSON.parse(data);
                if (chunk.paragraphs) {
                  // Record the actual offset for this chunk (and derive next chunk's offset)
                  if (chunk.start != null) chunkOffsets[chunk.chunk_idx] = chunk.start;
                  if (chunk.end != null) chunkOffsets[chunk.chunk_idx + 1] = chunk.end + 1;
                  for (const p of chunk.paragraphs) {
                    if (p.index < translated.length) translated[p.index] = p.text;
                  }
                  delete chunkTexts[chunk.chunk_idx];
                  if (!translationAbortRef.current) {
                    setTranslatedParagraphs([...translated]);
                    const doneCount = translated.filter(Boolean).length;
                    const pct = doneCount / paragraphs.length;
                    setTranslationProgress(pct);
                    const statusPrefix = seenEntityOriginals.size > 0 ? `${seenEntityOriginals.size} entities · ` : "";
                    setTranslationStatus(`${statusPrefix}Translating... ${doneCount}/${paragraphs.length}`);
                  }
                }
              } else if (event === "title") {
                const cleaned = titleCase(data);
                setTranslatedTitle(cleaned);
                saveTranslatedTitle(cleaned);
              } else if (event === "error") {
                console.log("[DaoReader] SSE error:", data);
                setTranslating(false);
                return;
              }
            }
          }
          // Final flush
          if (tokenUpdateRef.current !== null) {
            cancelAnimationFrame(tokenUpdateRef.current);
            flushTokens();
          }
          if (!translationAbortRef.current) {
            translatedContentRef.current = { content: rawContent, tier: translationTier };
            setTranslationProgress(1);
            setTranslationDone(true);
            setTranslating(false);
          }
        } catch {
          translateFreeGT(paragraphs, chapterTitle, rawContent);
        }
      })();
    } else {
      translateFreeGT(paragraphs, chapterTitle, rawContent);
    }

    } // end doTranslate

    return () => {
      translationAbortRef.current = true;
      if (tokenUpdateRef.current !== null) {
        cancelAnimationFrame(tokenUpdateRef.current);
        tokenUpdateRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawContent, retranslateKey, translationTier, tierLoaded]);

  const saveTranslatedTitle = useCallback((translatedTitleText: string) => {
    if (!bookId || !isAuthenticated || !translatedTitleText || !sourceUrl) return;
    fetch("/api/reader/save-translation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId,
        chapterSeq: chapterSeq ?? null,
        sourceUrl,
        translatedTitle: translatedTitleText,
        translatedText: "",
        sourceDomain: domain,
      }),
    }).catch(() => {});
  }, [bookId, domain, sourceUrl, isAuthenticated, chapterSeq]);

  const translateFreeGT = useCallback((paras: string[], title: string, content: string) => {
    if (title) {
      translateText(title).then((t) => {
        if (!translationAbortRef.current && t !== title) {
          const cleaned = titleCase(t);
          setTranslatedTitle(cleaned);
          saveTranslatedTitle(cleaned);
        }
      });
    }
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
        translatedContentRef.current = { content, tier: "free" };
        setTranslationDone(true);
        setTranslating(false);
      }
    })();
  }, [saveTranslatedTitle]);

  const retranslate = useCallback(() => {
    translationAbortRef.current = true;
    translatedContentRef.current = null;
    skipCacheRef.current = true;
    setTimeout(() => setRetranslateKey((k) => k + 1), 50);
  }, []);

  const handleNavigate = useCallback(
    async (url: string) => {
      setNavigating(true);
      translationAbortRef.current = true;
      onNavigate(url);
      setTimeout(() => setNavigating(false), 15000);
    },
    [onNavigate],
  );

  const entityPhase = translating && !translatedParagraphs.some(Boolean) && detectedEntities.length > 0;

  const handleEntityClick = useCallback(async (entity: DetectedEntity) => {
    if (!isAuthenticated || !bookId) return;
    // Look up the entity ID from the API to enable editing
    try {
      const res = await fetch(`/api/reader/entities?bookId=${bookId}`);
      if (!res.ok) return;
      const data = await res.json();
      const match = (data.entities || []).find(
        (e: { sourceTerm: string }) => e.sourceTerm === entity.original,
      );
      setEditingEntity({
        id: match?.id ?? null,
        original: entity.original,
        translated: entity.translated,
        gender: entity.gender || "N",
      });
    } catch {
      // Fall back to opening without id
      setEditingEntity({
        original: entity.original,
        translated: entity.translated,
        gender: entity.gender || "N",
      });
    }
  }, [isAuthenticated, bookId]);

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full">
      {/* Back button + book title + source */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0 size-8" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm text-muted-foreground truncate flex-1">{bookTitle}</span>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors shrink-0"
        >
          {domain}
          <ExternalLink className="size-3" />
        </a>
      </div>

      {/* Chapter title */}
      <h1 className="text-lg sm:text-xl font-medium text-center leading-snug">
        {lang === "en" && translatedTitle ? translatedTitle : chapterTitle}
      </h1>

      {/* Chapter info line */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        {chapterSeq != null && <span>Ch. {chapterSeq}</span>}
        {chapterSeq != null && domain && <span>·</span>}
        {domain && <span>{domain}</span>}
      </div>

      {/* Language toggle + reading time */}
      <div className="flex items-center justify-center gap-2.5">
        <div className="flex rounded-full border border-border text-xs overflow-hidden">
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
        <span className="text-[11px] text-muted-foreground/40 flex items-center gap-1">
          <Clock className="size-3" />
          {readingMinutes} min
        </span>
      </div>

      {/* Chapter nav bar */}
      <div className="flex items-center gap-2 w-full">
        <Button variant="outline" size="sm" className="shrink-0" disabled={!prevUrl || navigating} onClick={() => prevUrl && handleNavigate(prevUrl)}>
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        <div className="flex-1 flex items-center justify-center gap-1">
          <Button
            variant={showEntities ? "secondary" : "ghost"}
            size="sm"
            disabled={detectedEntities.length === 0}
            onClick={() => setShowEntities(!showEntities)}
          >
            <BookType className="size-4" />
            <span className="hidden sm:inline">Glossary</span>
            {detectedEntities.length > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">{detectedEntities.length}</span>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={retranslate}>
            <RefreshCw className={`size-4 ${translating ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Retranslate</span>
          </Button>
        </div>

        <Button variant="outline" size="sm" className="shrink-0 relative" disabled={!nextUrl || navigating} onClick={() => nextUrl && handleNavigate(nextUrl)}>
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" />
          {prefetchStatus === "ready" && nextUrl && !navigating && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-green-500" title="Next chapter ready" />
          )}
          {prefetchStatus === "loading" && nextUrl && !navigating && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-amber-400 animate-pulse" title="Prefetching..." />
          )}
        </Button>
      </div>

      {/* Translation status + progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="h-5 flex items-center justify-center">
          {translating && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-in fade-in duration-150">
              <Loader2 className="size-3 animate-spin shrink-0" />
              <span className="truncate">
                {rateLimited
                  ? "Rate limited — waiting to retry..."
                  : translationStatus || `Translating... ${translatedParagraphs.filter(Boolean).length}/${paragraphs.length}`}
              </span>
            </span>
          )}
        </div>
        {translating && (
          <div className="h-1 w-full max-w-xs mx-auto rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary/40 rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${Math.round(translationProgress * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <article
        ref={articleRef}
        className="w-full"
        style={{ fontSize: `${readerFontSize}px`, lineHeight: readerLineSpacing }}
      >
        {lang === "en" && translationDone ? (
          groupParagraphs(translatedParagraphs.filter(Boolean)).map((group, gi) => {
            if (group.type === "break") return <React.Fragment key={gi}><ChapterParagraph text={group.lines[0]} className="text-foreground/90 mb-3 sm:mb-4" /></React.Fragment>;
            if (group.type === "system") return <SystemBlockGroup key={gi} lines={group.lines} />;
            return group.lines.map((text, li) => (
              <ChapterParagraph
                key={`${gi}-${li}`}
                text={text}
                className="text-foreground/90 mb-3 sm:mb-4 animate-in fade-in duration-300"
                style={{ animationDelay: `${Math.min(gi * 20, 400)}ms` }}
                entities={detectedEntities}
                showEntities={showEntities}
                onEntityClick={handleEntityClick}
              />
            ));
          })
        ) : lang === "en" && translating ? (
          paragraphs.map((p, i) => {
            const translated = translatedParagraphs[i];
            if (translated) {
              return (
                <ChapterParagraph
                  key={i}
                  text={translated}
                  className="text-foreground/90 mb-3 sm:mb-4 animate-in fade-in duration-200"
                  entities={detectedEntities}
                  showEntities={showEntities}
                  onEntityClick={handleEntityClick}
                />
              );
            }
            return (
              <p key={i} className="text-muted-foreground/50 mb-3 sm:mb-4 transition-colors duration-200">
                {entityPhase ? highlightOriginalEntities(p, detectedEntities) : p}
              </p>
            );
          })
        ) : (
          groupParagraphs(paragraphs).map((group, gi) => {
            if (group.type === "break") return <React.Fragment key={gi}><ChapterParagraph text={group.lines[0]} className="text-foreground/90 mb-3 sm:mb-4" /></React.Fragment>;
            if (group.type === "system") return <SystemBlockGroup key={gi} lines={group.lines} />;
            return group.lines.map((text, li) => (
              <p key={`${gi}-${li}`} className="text-foreground/90 mb-3 sm:mb-4">
                {showEntities && detectedEntities.length > 0 ? highlightOriginalEntities(text, detectedEntities) : text}
              </p>
            ));
          })
        )}
      </article>

      {/* Bottom nav */}
      <nav className="flex items-center justify-between w-full border-t pt-4">
        <Button variant="outline" size="sm" disabled={!prevUrl || navigating} onClick={() => prevUrl && handleNavigate(prevUrl)}>
          <ChevronLeft className="size-4" />
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          {domain}
        </span>
        <Button variant="outline" size="sm" className="relative" disabled={!nextUrl || navigating} onClick={() => nextUrl && handleNavigate(nextUrl)}>
          Next
          <ChevronRight className="size-4" />
          {prefetchStatus === "ready" && nextUrl && !navigating && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-green-500" title="Next chapter ready" />
          )}
          {prefetchStatus === "loading" && nextUrl && !navigating && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-amber-400 animate-pulse" title="Prefetching..." />
          )}
        </Button>
      </nav>

      {/* Entity edit dialog */}
      {editingEntity && bookId && (
        <EntityDialog
          open={!!editingEntity}
          onOpenChange={(open) => {
            if (!open) setEditingEntity(null);
          }}
          entity={editingEntity}
          bookId={bookId}
          onSaved={() => {
            // Trigger retranslation to pick up updated entities
            retranslate();
          }}
        />
      )}

      {/* Selection copy tooltip */}
      {selTooltip && (
        <div
          data-sel-tooltip
          className="fixed z-50 animate-in fade-in duration-100"
          style={{ left: selTooltip.x, top: selTooltip.y, transform: "translate(-50%, -100%)" }}
        >
          <button
            onClick={handleSelCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs font-medium shadow-lg hover:opacity-90 transition-opacity"
          >
            {selCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {selCopied ? "Copied!" : "Copy with attribution"}
          </button>
        </div>
      )}
    </div>
  );
}
