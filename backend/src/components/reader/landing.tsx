"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { bookUrl } from "@/lib/utils";
import { ReaderView } from "@/components/reader/reader-view";
import { GoogleIcon } from "@/components/icons/provider-icons";
import { extractFromHtml, cleanChapterTitle, extractChapterSeq, fetchPageViaExtension } from "@/components/reader/utils";
import { translateAllProgressive, translateText } from "@/lib/google-translate";

// ─── Types ─────────────────────────────────────────────────

interface QidianChapter {
  id: number;
  sequenceNumber: number;
  title: string | null;
  titleTranslated: string | null;
  url: string | null;
}

interface CachedChapter {
  seq: number;
  title: string | null;
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
}: DaoReaderLandingProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [viewState, setViewState] = useState<ViewState>("browse");
  const [chapterData, setChapterData] = useState<ChapterData | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  const [popularDomains, setPopularDomains] = useState<PopularDomain[]>([]);
  const [editingProgress, setEditingProgress] = useState(false);
  const [manualSeq, setManualSeq] = useState(String(savedSeq ?? ""));
  const [chaptersPage, setChaptersPage] = useState(1);
  const [allQidianChapters, setAllQidianChapters] = useState(qidianChapters ?? []);
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);
  const [extensionAvailable, setExtensionAvailable] = useState<boolean | null>(null);
  const isMobile = useIsMobile();

  // Prefetch state
  const prefetchRef = useRef<{
    url: string;
    data: ChapterData;
    translatedParagraphs?: string[];
    translatedTitle?: string;
  } | null>(null);
  const prefetchAbortRef = useRef(false);
  const [prefetchedTranslation, setPrefetchedTranslation] = useState<{
    paragraphs: string[];
    title: string;
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

  useEffect(() => {
    fetch(`/api/reader/popular-domains?bookId=${bookId}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPopularDomains(data); })
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
      prefetchAbortRef.current = true;
      setTimeout(() => prefetchNextChapter(chapterData.nextUrl!), 500);
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
    } else {
      // Browse mode — clean URL (just the path with slug)
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [chapterData, viewState]);

  // ─── Actions ─────────────────────────────────────────────

  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(bookTitleRaw + " 阅读")}`;
  const totalReaders = popularDomains.reduce((sum, d) => sum + d.readers, 0);

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

  const loadMoreChapters = async () => {
    const nextPage = chaptersPage + 1;
    const res = await fetch(`/api/books/${bookId}/chapters?page=${nextPage}`);
    if (res.ok) {
      const data = await res.json();
      if (data.items) {
        setAllQidianChapters((prev) => [...prev, ...data.items]);
        setChaptersPage(nextPage);
      }
    }
  };

  const fetchAndRead = useCallback(async (url: string) => {
    setFetchingUrl(url);
    try {
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
    } catch { /* extension unavailable */ }
    setFetchingUrl(null);
    window.open(url, "_blank");
    setViewState("waiting");
  }, []);

  const prefetchNextChapter = useCallback((nextUrl: string) => {
    if (!nextUrl || prefetchRef.current?.url === nextUrl) return;
    prefetchAbortRef.current = false;
    prefetchRef.current = null;
    setPrefetchStatus("loading");

    const extId = document.documentElement.getAttribute("data-daosearch-ext-id");
    if (!extId || !chromeApi?.runtime?.sendMessage) { setPrefetchStatus("idle"); return; }

    chromeApi.runtime.sendMessage(extId, { type: "fetch-page", url: nextUrl },
      async (response: { ok: boolean; html?: string } | null) => {
        if (prefetchAbortRef.current || !response?.ok || !response.html) { setPrefetchStatus("idle"); return; }
        const extracted = extractFromHtml(response.html, nextUrl);
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
        } catch {
          if (prefetchRef.current?.url === nextUrl) setPrefetchStatus("ready");
        }
      },
    );
  }, [bookTitle, bookTitleRaw]);

  const handleReaderNavigate = useCallback(async (url: string) => {
    if (prefetchRef.current?.url === url) {
      const cached = prefetchRef.current;
      prefetchRef.current = null;
      setPrefetchStatus("idle");
      setChapterData(cached.data);
      setPrefetchedTranslation(
        cached.translatedParagraphs?.some(Boolean)
          ? { paragraphs: cached.translatedParagraphs!, title: cached.translatedTitle || "" }
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

  return (
    <div className="flex flex-col gap-8 sm:gap-10 min-w-0">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
        <Link href={bookUrl(bookId, bookTitle)} className="shrink-0 self-center sm:self-start">
          {bookImageUrl ? (
            <Image
              src={bookImageUrl}
              alt={bookTitle}
              width={220}
              height={308}
              className="rounded-xl object-cover shadow-md w-[140px] sm:w-[160px]"
              priority
            />
          ) : (
            <div className="w-[140px] sm:w-[160px] h-[196px] sm:h-[224px] rounded-xl bg-muted border flex items-center justify-center">
              <BookText className="size-8 text-muted-foreground" />
            </div>
          )}
        </Link>

        <div className="flex flex-col min-w-0 flex-1 text-center sm:text-left">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary w-fit mx-auto sm:mx-0 mb-1.5">
            <Globe className="size-3.5" />
            Dao Reader
          </span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
            {bookTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{bookTitleRaw}</p>

          {/* Stats */}
          <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-1.5 min-h-[28px]">
            {totalReaders > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-border bg-muted/50">
                <Eye className="size-3 text-muted-foreground" />
                {totalReaders} reader{totalReaders !== 1 ? "s" : ""}
              </span>
            )}
            {extensionAvailable === true && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400">
                <span className="size-1.5 rounded-full bg-green-500" />
                Extension connected
              </span>
            )}
            {extensionAvailable === false && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3" />
                Extension required
              </span>
            )}
            {extensionAvailable === null && (
              <span className="inline-flex items-center rounded-full w-36 h-7 bg-muted/50 animate-pulse" />
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            {/* Continue Reading */}
            {savedSeq != null && savedSourceUrl && (
              <Button
                className="gap-2.5 h-11 w-full sm:w-auto max-w-full sm:max-w-xs overflow-hidden"
                disabled={!!fetchingUrl}
                onClick={() => fetchAndRead(savedSourceUrl)}
              >
                {fetchingUrl === savedSourceUrl ? (
                  <Loader2 className="size-4 animate-spin shrink-0" />
                ) : (
                  <Play className="size-4 shrink-0" />
                )}
                <span className="truncate">{cachedTitle || `Chapter ${savedSeq}`}</span>
              </Button>
            )}

            {/* Book Page */}
            <Link href={bookUrl(bookId, bookTitle)} className="w-full sm:w-auto">
              <Button variant="outline" className="gap-2 h-11 w-full sm:w-auto">
                <BookText className="size-4" />
                Book Page
              </Button>
            </Link>
          </div>

          {/* Source info + set progress */}
          {savedSeq != null && (
            <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-3">
              {savedDomain && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <DomainFavicon domain={savedDomain} className="size-3.5" />
                  Ch. {savedSeq} · {savedDomain}
                </span>
              )}

              {/* Set progress — Drawer on mobile, Popover on desktop */}
              {isMobile ? (
                <>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    onClick={() => setEditingProgress(true)}
                  >
                    <Pencil className="size-3" />
                    Set progress
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
                    <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                      <Pencil className="size-3" />
                      Set progress
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

      {/* ── Find Sources ── */}
      <section>
        <h2 className="text-base sm:text-lg font-medium mb-1">Find Sources</h2>
        <p className="text-sm text-muted-foreground mb-4">Search for raw chapters or paste a direct link to translate</p>

        {/* Google Search — prominent */}
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
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="Or paste a chapter URL to translate..."
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

        {/* Popular sources */}
        {popularDomains.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-2">Popular sources</p>
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

        {/* Extension warning moved to top of page */}
      </section>

      {/* ── Qidian Chapters ── */}
      {isQidian && allQidianChapters.length > 0 && (
        <section>
          <h2 className="text-base sm:text-lg font-medium mb-3 flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" />
            Chapters
            <span className="text-sm text-muted-foreground font-normal">
              {totalChapterCount > 0 ? totalChapterCount.toLocaleString() : `${allQidianChapters.length}+`}
            </span>
          </h2>
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
          {chaptersPage < qidianTotalPages && (
            <div className="flex justify-center mt-3">
              <Button size="sm" onClick={loadMoreChapters}>
                Load More
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ── Translation History ── */}
      {cachedChapters.length > 0 && (
        <section>
          <h2 className="text-base sm:text-lg font-medium mb-3 flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            Your Translations
            <span className="text-sm text-muted-foreground font-normal">{cachedChapters.length}</span>
          </h2>
          <div className="flex flex-col rounded-lg border divide-y overflow-hidden">
            {cachedChapters.slice(0, 10).map((ch) => (
              <button
                key={ch.seq}
                className="flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
                onClick={() => {
                  // TODO: open cached chapter in reading mode
                }}
              >
                <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-8 text-right">
                  {ch.seq}
                </span>
                <span className="text-sm truncate flex-1">
                  {ch.title || `Chapter ${ch.seq}`}
                </span>
                <span className="text-[11px] text-muted-foreground/60 shrink-0 tabular-nums">
                  {ch.translatedAgo}
                </span>
              </button>
            ))}
          </div>
          {cachedChapters.length > 10 && (
            <div className="flex justify-center mt-3">
              <Button variant="outline" size="sm">
                Show all {cachedChapters.length} translations
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ── Auth notice ── */}
      {!isAuthenticated && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Sign in to track your reading progress and save translations.
        </p>
      )}
    </div>
  );
}
