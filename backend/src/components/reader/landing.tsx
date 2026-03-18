"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Loader2,
  Play,
  Globe,
  Link2,
  History,
  AlertTriangle,
  Eye,
  ScrollText,
  BookText,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { bookUrl, slugify } from "@/lib/utils";
import { ReaderView } from "@/components/reader/reader-view";
import { GoogleIcon } from "@/components/icons/provider-icons";
import { extractFromHtml, cleanChapterTitle, extractChapterSeq, fetchPageViaExtension, fetchViaTab } from "@/components/reader/utils";
import { translateAllProgressive, translateText } from "@/lib/google-translate";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/shared/responsive-dialog";

// ─── Types ─────────────────────────────────────────────────

interface QidianChapter {
  id: number;
  sequenceNumber: number;
  title: string | null;
  titleTranslated: string | null;
  url: string | null;
}

interface CachedChapter {
  seq: number | null;
  title: string | null;
  sourceDomain: string | null;
  translatedAgo: string;
}

interface DaoReaderLandingProps {
  bookId: number;
  bookTitle: string;
  bookTitleRaw: string;
  bookImageUrl: string | null;
  savedSourceUrl: string | null;
  savedSeq: number | null;
  savedDomain: string | null;
  cachedChapters: CachedChapter[];
  isQidian: boolean;
  qidianChapters: QidianChapter[] | null;
  qidianTotalPages: number;
  totalChapterCount: number;
  isAuthenticated: boolean;
  initialSourceUrl?: string | null;
  otherSources?: { sourceDomain: string | null; sourceUrl: string | null; seq: number | null }[];
}

interface PopularDomain {
  domain: string;
  readers: number;
}

interface ChapterData {
  content: string;
  title: string;
  nextUrl: string | null;
  prevUrl: string | null;
  sourceUrl: string;
  domain: string;
}

type ViewState = "browse" | "waiting" | "reading";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chromeApi = typeof window !== "undefined" ? (window as any).chrome : null;

function DomainFavicon({ domain, className = "size-4" }: { domain: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
      alt=""
      className={`${className} rounded-sm`}
      loading="lazy"
    />
  );
}

// ─── Translation History ──────────────────────────────────

const HISTORY_PAGE_SIZE = 20;

function TranslationHistory({
  cachedChapters,
  page,
  onPageChange,
}: {
  cachedChapters: CachedChapter[];
  page: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(cachedChapters.length / HISTORY_PAGE_SIZE);
  const start = (page - 1) * HISTORY_PAGE_SIZE;
  const displayed = cachedChapters.slice(start, start + HISTORY_PAGE_SIZE);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        {cachedChapters.length} translated chapters
      </p>
      <div className="flex flex-col rounded-lg border divide-y overflow-hidden">
        {displayed.map((ch, i) => (
          <div
            key={`${ch.seq}-${i}`}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-8 text-right">
              {ch.seq ?? "—"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">
                {ch.title || (ch.seq != null ? `Chapter ${ch.seq}` : "Untitled")}
              </p>
              {ch.sourceDomain && (
                <p className="flex items-center gap-1 mt-0.5 sm:hidden">
                  <DomainFavicon domain={ch.sourceDomain} className="size-3" />
                  <span className="text-[11px] text-muted-foreground/60">{ch.sourceDomain}</span>
                  <span className="text-[11px] text-muted-foreground/60">· {ch.translatedAgo}</span>
                </p>
              )}
            </div>
            {ch.sourceDomain && (
              <span className="hidden sm:flex items-center gap-1 shrink-0">
                <DomainFavicon domain={ch.sourceDomain} className="size-3" />
                <span className="text-[11px] text-muted-foreground/60">{ch.sourceDomain}</span>
              </span>
            )}
            <span className="hidden sm:block text-[11px] text-muted-foreground/60 shrink-0 tabular-nums">
              {ch.translatedAgo}
            </span>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground px-2">
            <span className="font-medium text-foreground">{page}</span>
            {" / "}
            {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────

export function DaoReaderLanding({
  bookId,
  bookTitle,
  bookTitleRaw,
  bookImageUrl,
  savedSourceUrl,
  savedSeq,
  savedDomain,
  cachedChapters,
  isQidian,
  qidianChapters,
  qidianTotalPages,
  totalChapterCount,
  isAuthenticated,
  initialSourceUrl,
  otherSources = [],
}: DaoReaderLandingProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [viewState, setViewState] = useState<ViewState>(initialSourceUrl ? "waiting" : "browse");
  const [chapterData, setChapterData] = useState<ChapterData | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  const [popularDomains, setPopularDomains] = useState<PopularDomain[]>([]);
  const [editingProgress, setEditingProgress] = useState(false);
  const [manualSeq, setManualSeq] = useState(String(savedSeq ?? ""));
  const defaultTab = isQidian ? "chapters" : "sources";
  const [chaptersPage, setChaptersPage] = useState(1);
  const [allQidianChapters, setAllQidianChapters] = useState(qidianChapters ?? []);
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);
  const [extensionAvailable, setExtensionAvailable] = useState<boolean | null>(null);
  const [translationTier, setTranslationTier] = useState<string>("free");
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [historyPage, setHistoryPage] = useState(1);
  const [totalReaders, setTotalReaders] = useState(0);
  const isMobile = useIsMobile();

  // Prefetch state
  const prefetchRef = useRef<{
    url: string;
    data: ChapterData;
    translatedParagraphs?: string[];
    translatedTitle?: string;
    entities?: { original: string; translated: string; gender: string; source: string }[];
  } | null>(null);
  const prefetchAbortRef = useRef(false);
  const [prefetchedTranslation, setPrefetchedTranslation] = useState<{
    paragraphs: string[];
    title: string;
    entities?: { original: string; translated: string; gender: string; source: string }[];
  } | null>(null);
  const [prefetchStatus, setPrefetchStatus] = useState<"idle" | "loading" | "ready">("idle");

  // ─── Effects ─────────────────────────────────────────────

  useEffect(() => {
    const extId = document.documentElement.getAttribute("data-daosearch-ext-id");
    if (extId) { setExtensionAvailable(true); return; }
    setTimeout(() => {
      setExtensionAvailable(!!document.documentElement.getAttribute("data-daosearch-ext-id"));
    }, 1500);
  }, []);

  // Restore tab + pagination from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) setActiveTab(tab);
    const cp = Number(params.get("cp"));
    if (cp > 1) {
      setChaptersPage(cp);
      fetch(`/api/books/${bookId}/chapters?page=${cp}`)
        .then((r) => r.json())
        .then((data) => { if (data.items) setAllQidianChapters(data.items); })
        .catch(() => {});
    }
    const hp = Number(params.get("hp"));
    if (hp > 1) setHistoryPage(hp);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load chapter from URL query param (?src=...)
  useEffect(() => {
    if (initialSourceUrl) {
      fetchAndRead(initialSourceUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load translation tier
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

  // Signal waiting state to extension so FAB only shows when reader is expecting content
  useEffect(() => {
    document.dispatchEvent(new CustomEvent("daosearch-reader-waiting", {
      detail: { waiting: viewState === "waiting" },
    }));
  }, [viewState]);

  useEffect(() => {
    fetch(`/api/reader/popular-domains?bookId=${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.domains) {
          setPopularDomains(data.domains);
          setTotalReaders(data.totalReaders ?? 0);
        } else if (Array.isArray(data)) {
          // Fallback for old API shape
          setPopularDomains(data);
        }
      })
      .catch(() => {});
  }, [bookId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ChapterData>).detail;
      if (detail?.content) { setChapterData(detail); setViewState("reading"); }
    };
    document.addEventListener("daosearch-chapter", handler);
    return () => document.removeEventListener("daosearch-chapter", handler);
  }, []);

  useEffect(() => {
    if (viewState === "reading" && chapterData?.nextUrl) {
      // Reset abort before starting prefetch (not before the timeout)
      const nextUrl = chapterData.nextUrl;
      const timer = setTimeout(() => {
        prefetchAbortRef.current = false;
        prefetchNextChapter(nextUrl);
      }, 500);
      return () => { clearTimeout(timer); prefetchAbortRef.current = true; };
    }
    return () => { prefetchAbortRef.current = true; };
  }, [chapterData, viewState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewState === "reading" && chapterData) {
      const params = new URLSearchParams();
      if (chapterData.sourceUrl) params.set("src", chapterData.sourceUrl);
      const seq = extractChapterSeq(chapterData.title);
      if (seq) params.set("ch", String(seq));
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, [chapterData, viewState]);

  // Sync tab + pagination to URL
  useEffect(() => {
    if (viewState !== "browse") return;
    const params = new URLSearchParams(window.location.search);
    const defaultTab = isQidian ? "chapters" : "sources";
    if (activeTab !== defaultTab) params.set("tab", activeTab);
    else params.delete("tab");
    if (chaptersPage > 1) params.set("cp", String(chaptersPage));
    else params.delete("cp");
    if (historyPage > 1) params.set("hp", String(historyPage));
    else params.delete("hp");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [activeTab, chaptersPage, historyPage, viewState, isQidian]);

  // ─── Actions ─────────────────────────────────────────────

  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(bookTitleRaw + " 阅读")}`;

  const handleManualProgress = async () => {
    const seq = Number(manualSeq);
    if (!seq || isNaN(seq) || seq < 1) return;
    if (totalChapterCount > 0 && seq > totalChapterCount) return;
    await fetch(`/api/books/${bookId}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterSeq: seq }),
    });
    setEditingProgress(false);
    router.refresh();
  };

  const handleDeleteSource = async () => {
    if (!deletingSource) return;
    setDeleteLoading(true);
    await fetch(`/api/books/${bookId}/progress?domain=${encodeURIComponent(deletingSource)}`, {
      method: "DELETE",
    });
    setDeleteLoading(false);
    setDeletingSource(null);
    router.refresh();
  };

  const loadChaptersPage = async (page: number) => {
    const res = await fetch(`/api/books/${bookId}/chapters?page=${page}`);
    if (res.ok) {
      const data = await res.json();
      if (data.items) {
        setAllQidianChapters(data.items);
        setChaptersPage(page);
      }
    }
  };

  const fetchAndRead = useCallback(async (url: string) => {
    setFetchingUrl(url);
    try {
      // Tier 1: static fetch (fast, works for most sites)
      const html = await fetchPageViaExtension(url);
      if (html) {
        const extracted = extractFromHtml(html, url);
        if (extracted) {
          setFetchingUrl(null);
          setPrefetchedTranslation(null);
          setChapterData({
            content: extracted.content,
            title: extracted.title,
            nextUrl: extracted.nextUrl,
            prevUrl: extracted.prevUrl,
            sourceUrl: extracted.url,
            domain: extracted.domain,
          });
          setViewState("reading");
          return;
        }
      }

      // Tier 2: tab-based fetch (handles Cloudflare, JS-rendered sites)
      const tabResult = await fetchViaTab(url);
      if (tabResult?.content) {
        setFetchingUrl(null);
        setPrefetchedTranslation(null);
        setChapterData({
          content: tabResult.content,
          title: tabResult.title || "",
          nextUrl: tabResult.nextUrl || null,
          prevUrl: tabResult.prevUrl || null,
          sourceUrl: tabResult.url || url,
          domain: tabResult.domain || new URL(url).hostname,
        });
        setViewState("reading");
        return;
      }
    } catch { /* extension unavailable */ }
    setFetchingUrl(null);
  }, []);

  const prefetchNextChapter = useCallback((nextUrl: string) => {
    if (!nextUrl || prefetchRef.current?.url === nextUrl) return;
    prefetchAbortRef.current = false;
    prefetchRef.current = null;
    setPrefetchStatus("loading");

    const extId = document.documentElement.getAttribute("data-daosearch-ext-id");
    if (!extId || !chromeApi?.runtime?.sendMessage) { setPrefetchStatus("idle"); return; }

    // Fetch the next chapter — try static fetch first, fall back to tab-based
    (async () => {
      let extracted: { content: string; title: string; nextUrl: string | null; prevUrl: string | null; url: string; domain: string } | null = null;

      // Tier 1: static fetch
      const html = await fetchPageViaExtension(nextUrl);
      if (!prefetchAbortRef.current && html) {
        extracted = extractFromHtml(html, nextUrl);
      }

      // Tier 2: tab-based fetch (Cloudflare etc.)
      if (!extracted && !prefetchAbortRef.current) {
        const tabResult = await fetchViaTab(nextUrl);
        if (tabResult?.content) {
          extracted = {
            content: tabResult.content,
            title: tabResult.title || "",
            nextUrl: tabResult.nextUrl || null,
            prevUrl: tabResult.prevUrl || null,
            url: tabResult.url || nextUrl,
            domain: tabResult.domain || new URL(nextUrl).hostname,
          };
        }
      }

      if (!extracted || prefetchAbortRef.current) { setPrefetchStatus("idle"); return; }

      const chData: ChapterData = {
        content: extracted.content, title: extracted.title,
        nextUrl: extracted.nextUrl, prevUrl: extracted.prevUrl,
        sourceUrl: extracted.url, domain: extracted.domain,
      };
      prefetchRef.current = { url: nextUrl, data: chData };

      try {
        const paras = extracted.content.split("\n").map((p: string) => p.trim()).filter(Boolean);
        const cleanedTitle = cleanChapterTitle(extracted.title, bookTitle, bookTitleRaw);

        if (translationTier === "premium" || translationTier === "byok") {
          // AI prefetch: non-streaming call to /api/reader/translate
          const res = await fetch("/api/reader/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paragraphs: paras,
              bookId: bookId || undefined,
              sourceDomain: extracted.domain,
              title: cleanedTitle,
              tier: translationTier,
              stream: false,
            }),
          });
          if (prefetchAbortRef.current) return;
          if (res.ok) {
            const data = await res.json();
            if (!prefetchAbortRef.current && prefetchRef.current?.url === nextUrl) {
              prefetchRef.current.translatedTitle = data.title || "";
              prefetchRef.current.translatedParagraphs = (data.paragraphs || []).map((p: { text: string }) => p.text);
              prefetchRef.current.entities = data.entities || [];
              setPrefetchStatus("ready");
            }
          } else {
            // Fallback to GT on error
            const [translatedTitle, translatedParagraphs] = await Promise.all([
              translateText(cleanedTitle),
              translateAllProgressive(paras, () => {}, {
                signal: { get aborted() { return prefetchAbortRef.current; } },
              }),
            ]);
            if (!prefetchAbortRef.current && prefetchRef.current?.url === nextUrl) {
              prefetchRef.current.translatedTitle = translatedTitle;
              prefetchRef.current.translatedParagraphs = translatedParagraphs;
              setPrefetchStatus("ready");
            }
          }
        } else {
          // Free tier: client-side GT
          const [translatedTitle, translatedParagraphs] = await Promise.all([
            translateText(cleanedTitle),
            translateAllProgressive(paras, () => {}, {
              signal: { get aborted() { return prefetchAbortRef.current; } },
            }),
          ]);
          if (!prefetchAbortRef.current && prefetchRef.current?.url === nextUrl) {
            prefetchRef.current.translatedTitle = translatedTitle;
            prefetchRef.current.translatedParagraphs = translatedParagraphs;
            setPrefetchStatus("ready");
          }
        }
      } catch {
        if (prefetchRef.current?.url === nextUrl) setPrefetchStatus("ready");
      }
    })();
  }, [bookId, bookTitle, bookTitleRaw, translationTier]);

  const handleReaderNavigate = useCallback(async (url: string) => {
    if (prefetchRef.current?.url === url) {
      const cached = prefetchRef.current;
      prefetchRef.current = null;
      setPrefetchStatus("idle");
      setChapterData(cached.data);
      setPrefetchedTranslation(
        cached.translatedParagraphs?.some(Boolean)
          ? { paragraphs: cached.translatedParagraphs!, title: cached.translatedTitle || "", entities: cached.entities }
          : null,
      );
      return;
    }
    setPrefetchedTranslation(null);
    setPrefetchStatus("idle");

    const extId = document.documentElement.getAttribute("data-daosearch-ext-id");
    if (!extId || !chromeApi?.runtime?.sendMessage) return;
    chromeApi.runtime.sendMessage(extId, { type: "fetch-page", url },
      (response: { ok: boolean; html?: string } | null) => {
        if (response?.ok && response.html) {
          const extracted = extractFromHtml(response.html, url);
          if (extracted) {
            setChapterData({
              content: extracted.content, title: extracted.title,
              nextUrl: extracted.nextUrl, prevUrl: extracted.prevUrl,
              sourceUrl: extracted.url, domain: extracted.domain,
            });
          }
        }
      },
    );
  }, []);

  const handleReaderBack = useCallback(() => {
    setPrefetchedTranslation(null);
    setPrefetchStatus("idle");
    startTransition(() => {
      router.refresh();
      setViewState("browse");
      setChapterData(null);
    });
  }, [router, startTransition]);

  // ─── Reading mode ────────────────────────────────────────

  if (viewState === "reading" && chapterData) {
    return (
      <ReaderView
        bookId={bookId}
        bookTitle={bookTitle}
        bookTitleRaw={bookTitleRaw}
        rawTitle={chapterData.title}
        rawContent={chapterData.content}
        nextUrl={chapterData.nextUrl}
        prevUrl={chapterData.prevUrl}
        sourceUrl={chapterData.sourceUrl}
        domain={chapterData.domain}
        isAuthenticated={isAuthenticated}
        onNavigate={handleReaderNavigate}
        onBack={handleReaderBack}
        prefetchedTranslation={prefetchedTranslation}
        prefetchStatus={prefetchStatus}
      />
    );
  }

  // ─── Landing ─────────────────────────────────────────────

  const cachedTitle = savedSeq != null ? cachedChapters.find((c) => c.seq === savedSeq)?.title : null;

  // Determine first chapter URL for "Start Reading" CTA
  const firstChapterUrl = allQidianChapters.length > 0 ? allQidianChapters[0].url : null;

  return (
    <div className="flex flex-col gap-5 min-w-0">
      {/* ── Header ── */}
      <div className="flex gap-5 sm:gap-6">
        <Link href={bookUrl(bookId, bookTitle)} className="shrink-0 self-start">
          {bookImageUrl ? (
            <Image
              src={bookImageUrl}
              alt={bookTitle}
              width={140}
              height={196}
              className="rounded-xl object-cover shadow-md w-[110px] sm:w-[140px]"
              priority
            />
          ) : (
            <div className="w-[110px] sm:w-[140px] aspect-[5/7] rounded-xl bg-muted border flex items-center justify-center">
              <BookText className="size-6 text-muted-foreground" />
            </div>
          )}
        </Link>

        <div className="flex flex-col min-w-0 flex-1 pt-0.5">
          {/* Title */}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight line-clamp-2">
            {bookTitle}
          </h1>
          <p className="text-sm text-muted-foreground/70 truncate mt-0.5">{bookTitleRaw}</p>

          {/* Reading progress */}
          {savedSeq != null && savedDomain && (
            <div className="flex items-center gap-2 mt-3 text-sm">
              <DomainFavicon domain={savedDomain} className="size-4" />
              <span className="font-medium">Ch. {savedSeq}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground truncate">{savedDomain}</span>
              {isMobile ? (
                <>
                  <button
                    className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-0.5 shrink-0"
                    onClick={() => setEditingProgress(true)}
                  >
                    <Pencil className="size-2.5" />
                  </button>
                  <Drawer open={editingProgress} onOpenChange={setEditingProgress}>
                    <DrawerContent>
                      <DrawerHeader>
                        <DrawerTitle>Set reading progress</DrawerTitle>
                      </DrawerHeader>
                      <div className="flex gap-2 px-4 pb-6">
                        <Input
                          type="number"
                          value={manualSeq}
                          onChange={(e) => setManualSeq(e.target.value)}
                          placeholder="Chapter number"
                          className="h-10 flex-1"
                          min={1}
                          max={totalChapterCount > 0 ? totalChapterCount : undefined}
                          onKeyDown={(e) => e.key === "Enter" && handleManualProgress()}
                          autoFocus
                        />
                        <Button className="h-10" onClick={handleManualProgress}>Save</Button>
                      </div>
                    </DrawerContent>
                  </Drawer>
                </>
              ) : (
                <Popover open={editingProgress} onOpenChange={setEditingProgress}>
                  <PopoverTrigger asChild>
                    <button className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-0.5 shrink-0">
                      <Pencil className="size-2.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <p className="text-xs text-muted-foreground mb-2">Set reading progress</p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={manualSeq}
                        onChange={(e) => setManualSeq(e.target.value)}
                        placeholder="Chapter #"
                        className="h-8 flex-1"
                        min={1}
                        max={totalChapterCount > 0 ? totalChapterCount : undefined}
                        onKeyDown={(e) => e.key === "Enter" && handleManualProgress()}
                        autoFocus
                      />
                      <Button size="sm" className="h-8" onClick={handleManualProgress}>Save</Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {totalReaders > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-foreground">
                <Eye className="size-3" />
                {totalReaders} {totalReaders === 1 ? "reader" : "readers"}
              </span>
            )}
            {extensionAvailable === true && (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/5 px-2 py-0.5 text-[11px] text-green-600 dark:text-green-400">
                <span className="size-1.5 rounded-full bg-green-500" />
                Connected
              </span>
            )}
            {extensionAvailable === false && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3" />
                Extension needed
              </span>
            )}
            {extensionAvailable === null && (
              <span className="inline-block w-20 h-5 bg-muted/50 rounded-full animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* ── Other source progresses ── */}
      {otherSources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground/60">Other sources</span>
          <div className="flex flex-wrap gap-2">
            {otherSources.map((src) => (
              <button
                key={src.sourceDomain}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
                disabled={!src.sourceUrl || !!fetchingUrl}
                onClick={() => { if (src.sourceUrl) fetchAndRead(src.sourceUrl); }}
              >
                {src.sourceDomain && <DomainFavicon domain={src.sourceDomain} className="size-3.5" />}
                <span className="text-muted-foreground">{src.sourceDomain || "Unknown"}</span>
                {src.seq != null && <span className="text-xs text-muted-foreground/60">Ch. {src.seq}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Action Buttons (book-page style) ── */}
      <div className="flex flex-col gap-2">
        {/* Primary CTA */}
        {savedSeq != null && savedSourceUrl ? (
          <Button
            className="w-full gap-2"
            disabled={!!fetchingUrl}
            onClick={() => fetchAndRead(savedSourceUrl)}
          >
            {fetchingUrl === savedSourceUrl ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            <span className="truncate">
              {cachedTitle ? `Continue: ${cachedTitle}` : `Continue Ch. ${savedSeq}`}
            </span>
          </Button>
        ) : isQidian && firstChapterUrl ? (
          <Button
            className="w-full gap-2"
            disabled={!!fetchingUrl}
            onClick={() => fetchAndRead(firstChapterUrl)}
          >
            {fetchingUrl === firstChapterUrl ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4 fill-current" />
            )}
            Start Reading
          </Button>
        ) : (
          <a
            href={googleSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setViewState("waiting")}
            className="w-full"
          >
            <Button className="w-full gap-2" variant="default">
              <Search className="size-4" />
              Find a Source
            </Button>
          </a>
        )}

        {/* Secondary buttons row */}
        <div className="flex gap-2">
          <Link href={`/reader/${bookId}/glossary/${slugify(bookTitle)}`} className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <ScrollText className="size-4" />
              Glossary
            </Button>
          </Link>
          <Link href={bookUrl(bookId, bookTitle)} className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <BookText className="size-4" />
              Book Page
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Waiting state ── */}
      {viewState === "waiting" && (
        <div className="rounded-xl border border-dashed p-6">
          {extensionAvailable === false ? (
            <div className="flex flex-col items-center gap-4 text-center max-w-md mx-auto">
              <div className="size-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="size-4 text-amber-500" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Extension not installed</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The DaoSearch extension is needed to send chapter content back to this page.
                  Install it from the Chrome Web Store, then try again.
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setViewState("browse")}>
                Go back
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center max-w-md mx-auto">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="size-4 animate-spin text-primary" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Listening for content...</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Navigate to a chapter from the Google search results, then click the
                  <span className="font-medium text-foreground"> DaoSearch extension button</span> to send it here for translation.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-1.5 sm:flex sm:items-center sm:justify-center sm:gap-4 text-muted-foreground/60 w-full">
                <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1.5">
                  <span className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">1</span>
                  <span className="text-[10px] sm:text-xs">Search</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1.5">
                  <span className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">2</span>
                  <span className="text-[10px] sm:text-xs">Open</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1.5">
                  <span className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">3</span>
                  <span className="text-[10px] sm:text-xs">Extension</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1.5">
                  <span className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium shrink-0">4</span>
                  <span className="text-[10px] sm:text-xs text-primary">Read</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setViewState("browse")}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Extension warning ── */}
      {extensionAvailable === false && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="size-9 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-4 text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Extension not installed</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              The DaoSearch browser extension is required to fetch and translate chapters.
              Install it from the Chrome Web Store to get started.
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          {isQidian && (
            <TabsTrigger value="chapters" className="flex-1">
              <ScrollText className="size-3.5" />
              Chapters
            </TabsTrigger>
          )}
          <TabsTrigger value="sources" className="flex-1">
            <Globe className="size-3.5" />
            Sources
          </TabsTrigger>
          {cachedChapters.length > 0 && (
            <TabsTrigger value="history" className="flex-1">
              <History className="size-3.5" />
              History
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Chapters Tab ── */}
        {isQidian && (
          <TabsContent value="chapters">
            {allQidianChapters.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-3">
                  {totalChapterCount > 0 ? totalChapterCount.toLocaleString() : `${allQidianChapters.length}+`} chapters
                </p>
                <div className="flex flex-col rounded-lg border divide-y overflow-hidden">
                  {allQidianChapters.map((ch) => {
                    const isCurrent = savedSeq === ch.sequenceNumber;
                    const isLoading = fetchingUrl === ch.url;
                    return (
                      <button
                        key={ch.id}
                        className={`flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors ${isCurrent ? "bg-accent/30" : ""}`}
                        disabled={isLoading}
                        onClick={() => { if (ch.url) fetchAndRead(ch.url); }}
                      >
                        <span className={`text-xs tabular-nums shrink-0 w-8 text-right ${isCurrent ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {ch.sequenceNumber}
                        </span>
                        <span className="text-sm truncate flex-1">
                          {ch.titleTranslated || ch.title || `Chapter ${ch.sequenceNumber}`}
                        </span>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-[10px] shrink-0 h-5">Reading</Badge>
                        )}
                        {isLoading ? (
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {qidianTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={chaptersPage <= 1}
                      onClick={() => loadChaptersPage(chaptersPage - 1)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-xs tabular-nums text-muted-foreground px-2">
                      <span className="font-medium text-foreground">{chaptersPage}</span>
                      {" / "}
                      {qidianTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={chaptersPage >= qidianTotalPages}
                      onClick={() => loadChaptersPage(chaptersPage + 1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No chapters available.</p>
            )}
          </TabsContent>
        )}

        {/* ── Sources Tab ── */}
        <TabsContent value="sources">
          <div className="flex flex-col gap-4">
            {/* Google Search */}
            <a
              href={googleSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setViewState("waiting")}
              className="flex items-center gap-3 rounded-xl border p-4 hover:bg-accent/40 transition-colors group"
            >
              <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0 group-hover:bg-accent transition-colors">
                <GoogleIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Search for chapters</p>
                <p className="text-xs text-muted-foreground truncate">
                  <span className="text-foreground/60">Google:</span> {bookTitleRaw} 阅读
                </p>
              </div>
              <ExternalLink className="size-4 text-muted-foreground/40 shrink-0" />
            </a>

            {/* Paste URL */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="Paste a chapter URL to translate..."
                  className="h-10 pl-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pasteUrl.trim()) fetchAndRead(pasteUrl.trim());
                  }}
                />
              </div>
              <Button
                className="h-10 w-full sm:w-auto shrink-0"
                disabled={!pasteUrl.trim() || !!fetchingUrl}
                onClick={() => fetchAndRead(pasteUrl.trim())}
              >
                {fetchingUrl === pasteUrl.trim() ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Translate
              </Button>
            </div>

            {/* Your sources */}
            {isAuthenticated && savedSourceUrl && savedDomain && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Your sources</p>
                <div className="flex flex-col rounded-lg border divide-y overflow-hidden">
                  {/* Primary source */}
                  <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors">
                    <button
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      disabled={!!fetchingUrl}
                      onClick={() => fetchAndRead(savedSourceUrl)}
                    >
                      <DomainFavicon domain={savedDomain} className="size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{savedDomain}</p>
                        <p className="text-xs text-muted-foreground truncate">{savedSourceUrl}</p>
                      </div>
                      {savedSeq != null && (
                        <span className="text-xs text-muted-foreground shrink-0">Ch. {savedSeq}</span>
                      )}
                      {fetchingUrl === savedSourceUrl ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                    </button>
                    <button
                      className="shrink-0 p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove source and its translations"
                      onClick={(e) => { e.stopPropagation(); setDeletingSource(savedDomain); }}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {/* Other sources */}
                  {otherSources.filter((s) => s.sourceUrl && s.sourceDomain).map((src) => (
                    <div key={src.sourceDomain} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors">
                      <button
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                        disabled={!src.sourceUrl || !!fetchingUrl}
                        onClick={() => { if (src.sourceUrl) fetchAndRead(src.sourceUrl); }}
                      >
                        <DomainFavicon domain={src.sourceDomain!} className="size-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{src.sourceDomain}</p>
                          <p className="text-xs text-muted-foreground truncate">{src.sourceUrl}</p>
                        </div>
                        {src.seq != null && (
                          <span className="text-xs text-muted-foreground shrink-0">Ch. {src.seq}</span>
                        )}
                        {fetchingUrl === src.sourceUrl ? (
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
                        )}
                      </button>
                      <button
                        className="shrink-0 p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remove source and its translations"
                        onClick={(e) => { e.stopPropagation(); setDeletingSource(src.sourceDomain!); }}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Popular sources */}
            {popularDomains.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Popular with readers</p>
                <div className="flex flex-wrap gap-2">
                  {popularDomains.map((d) => (
                    <div key={d.domain} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                      <DomainFavicon domain={d.domain} className="size-4" />
                      <span className="text-sm">{d.domain}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="size-3" />
                        {d.readers}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── History Tab ── */}
        {cachedChapters.length > 0 && (
          <TabsContent value="history">
            <TranslationHistory
              cachedChapters={cachedChapters}
              page={historyPage}
              onPageChange={setHistoryPage}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* ── Auth notice ── */}
      {!isAuthenticated && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Sign in to track your reading progress and save translations.
        </p>
      )}

      {/* ── Delete source confirmation ── */}
      <ResponsiveDialog open={!!deletingSource} onOpenChange={(open) => { if (!open) setDeletingSource(null); }}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Remove source</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Remove <span className="font-medium text-foreground">{deletingSource}</span> and all its cached translations? Your reading progress from this source will be lost.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeletingSource(null)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeleteSource} disabled={deleteLoading}>
            {deleteLoading && <Loader2 className="size-3 animate-spin mr-1.5" />}
            Remove
          </Button>
        </div>
      </ResponsiveDialog>

    </div>
  );
}
