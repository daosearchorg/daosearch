"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  Search,
  Hash,
  BookOpen,
  Check,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Readability } from "@mozilla/readability";
import { readerUrl } from "@/lib/utils";
import { ReaderView } from "@/components/reader/reader-view";

interface ExtractedData {
  url: string;
  domain: string;
  title: string;
  content: string;
  nextUrl: string | null;
  prevUrl: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chromeApi = typeof window !== "undefined" ? (window as any).chrome : null;

function getExtId(): string | null {
  return document.documentElement.getAttribute("data-daosearch-ext-id");
}

/** Ask the extension background to fetch a page's HTML (bypasses CORS). */
async function fetchPageViaExtension(url: string): Promise<string | null> {
  const extId = getExtId();
  if (!extId || !chromeApi?.runtime?.sendMessage) return null;

  return new Promise((resolve) => {
    chromeApi.runtime.sendMessage(extId, { type: "fetch-page", url }, (resp: { ok: boolean; html?: string; error?: string } | null) => {
      if (resp?.ok && resp.html) resolve(resp.html);
      else resolve(null);
    });
  });
}

/** Navigate source tab to URL, wait for JS to render, then extract via content script. */
async function navigateAndExtract(url: string, sourceTabId: number): Promise<ExtractedData | null> {
  const extId = getExtId();
  if (!extId || !chromeApi?.runtime?.sendMessage) return null;

  return new Promise((resolve) => {
    chromeApi.runtime.sendMessage(extId, { type: "navigate-and-extract", url, tabId: sourceTabId }, (resp: ExtractedData | null) => {
      resolve(resp || null);
    });
  });
}

/** Ask extension for the initially extracted data. */
async function getExtractedData(): Promise<ExtractedData | null> {
  const extId = getExtId();
  if (!extId || !chromeApi?.runtime?.sendMessage) return null;

  return new Promise((resolve) => {
    chromeApi.runtime.sendMessage(extId, { type: "get-extracted" }, (response: ExtractedData | null) => {
      resolve(response || null);
    });
  });
}

// ─── Content extraction (runs on fetched HTML) ───────────────

/** Convert Readability HTML to clean paragraph text. */
function htmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  for (const el of div.querySelectorAll("script, style, noscript")) el.remove();

  for (const el of div.querySelectorAll("p, div, br, li, h1, h2, h3, h4, h5, h6, tr")) {
    if (el.tagName === "BR") {
      el.replaceWith("\n");
    } else {
      el.insertAdjacentText("afterend", "\n");
    }
  }

  const lines = (div.textContent || "").split("\n");
  return lines
    .map(l => l.replace(/\s+/g, " ").trim())
    .filter(l => l.length > 0)
    .filter(l => !/^\d{1,4}$/.test(l))
    .filter(l => !/^[\d\s.,]+$/.test(l))
    .join("\n");
}

function cleanTitle(title: string): string {
  if (!title) return "";
  const parts = title.split(/\s*[-–—|_]\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts[0];
  return title.trim();
}

function extractFromHtml(html: string, url: string): ExtractedData | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);
  const domain = new URL(url).hostname;

  // Try to extract chapter title from DOM headings first
  const chapterRe = /第[\d一二三四五六七八九十百千万]+[章节回话篇卷集]|chapter\s*\d+/i;
  let domTitle = "";
  for (const h of doc.querySelectorAll("h1, h2, h3, .chapter-title, .title, .booktitle")) {
    const text = (h.textContent || "").trim();
    if (text && chapterRe.test(text) && text.length < 100) {
      domTitle = cleanTitle(text);
      break;
    }
  }
  if (!domTitle) {
    for (const h of doc.querySelectorAll("h1, h2, h3")) {
      const text = (h.textContent || "").trim();
      if (text && text.length > 2 && text.length < 80) {
        domTitle = cleanTitle(text);
        break;
      }
    }
  }

  // Readability extraction
  let contentText: string | null = null;
  let title = "";
  try {
    const reader = new Readability(doc.cloneNode(true) as Document);
    const article = reader.parse();
    if (article?.content) {
      contentText = htmlToText(article.content);
      title = domTitle || cleanTitle(article.title || "");
      // Validate: if title is too long, it's probably body text
      if (title.length > 100) title = cleanTitle(doc.title) || title.slice(0, 60);
    }
  } catch (e) {
    console.log("[DaoReader] Readability failed:", e);
  }

  if (!contentText || contentText.length < 50) return null;
  if (!title) title = doc.title || "";

  // Nav links from original HTML (Readability strips navigation)
  const nextPatterns = ["下一章", "下一节", "下一页", "下章", "next"];
  const prevPatterns = ["上一章", "上一节", "上一页", "上章", "prev"];
  let nextUrl: string | null = null;
  let prevUrl: string | null = null;

  const navDoc = new DOMParser().parseFromString(html, "text/html");
  for (const link of navDoc.querySelectorAll("a")) {
    const text = (link.textContent || "").trim().toLowerCase();
    const href = link.getAttribute("href");
    if (!href || href === "#" || href.startsWith("javascript:")) continue;
    try {
      const resolved = new URL(href, url).href;
      if (resolved === url) continue;
      if (!nextUrl && nextPatterns.some(p => text.includes(p))) nextUrl = resolved;
      if (!prevUrl && prevPatterns.some(p => text.includes(p))) prevUrl = resolved;
    } catch { /* invalid URL */ }
    if (nextUrl && prevUrl) break;
  }

  return { url, domain, title, content: contentText, nextUrl, prevUrl };
}

// ─── Book Picker types ───────────────────────────────────────

interface BookSearchResult {
  id: number;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  imageUrl: string | null;
}

function parseBookInput(input: string): number | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const urlMatch = trimmed.match(/(?:daosearch\.com|localhost:\d+)\/(?:book|reader)\/(\d+)/);
  if (urlMatch) return Number(urlMatch[1]);
  return null;
}

// ─── Book Picker Component ───────────────────────────────────

function BookPicker({ onSelect }: { onSelect: (book: BookSearchResult) => void }) {
  const [bookQuery, setBookQuery] = useState("");
  const [bookResults, setBookResults] = useState<BookSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (bookQuery.trim().length < 2) {
      setBookResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/books/search?q=${encodeURIComponent(bookQuery)}`);
        const data = await res.json();
        setBookResults(data);
      } catch {
        setBookResults([]);
      }
      setSearchLoading(false);
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [bookQuery]);

  const handleManualSubmit = useCallback(async () => {
    const bookId = parseBookInput(manualInput);
    if (!bookId) { setManualError("Enter a valid book ID or DaoSearch URL"); return; }
    setManualError("");
    setManualLoading(true);
    try {
      const res = await fetch(`/api/books/${bookId}`);
      if (res.ok) {
        const book = await res.json();
        onSelect({
          id: bookId,
          title: book.title,
          titleTranslated: book.titleTranslated,
          author: book.author,
          authorTranslated: book.authorTranslated,
          imageUrl: book.imageUrl,
        });
      } else {
        setManualError("Book not found");
      }
    } catch {
      setManualError("Could not look up book");
    } finally {
      setManualLoading(false);
    }
  }, [manualInput, onSelect]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={bookQuery}
            onChange={(e) => setBookQuery(e.target.value)}
            placeholder="Search for a book..."
            className="h-10 pl-9 text-sm"
          />
        </div>

        {(searchLoading || bookResults.length > 0 || (bookQuery.trim().length >= 2 && !searchLoading)) && (
          <div className="rounded-lg border overflow-hidden">
            {searchLoading && bookResults.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">Searching...</div>
            )}
            {!searchLoading && bookResults.length === 0 && bookQuery.trim().length >= 2 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No results found</div>
            )}
            {bookResults.length > 0 && (
              <div className="divide-y max-h-48 overflow-y-auto">
                {bookResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onSelect(r)}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-accent transition-colors"
                  >
                    {r.imageUrl ? (
                      <Image src={r.imageUrl} alt="" width={28} height={37} className="shrink-0 rounded object-cover w-7 h-[37px]" />
                    ) : (
                      <div className="shrink-0 w-7 h-[37px] rounded bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{r.titleTranslated || r.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{r.authorTranslated || r.author}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Manual ID / URL */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={manualInput}
              onChange={(e) => { setManualInput(e.target.value); setManualError(""); }}
              placeholder="Book ID or DaoSearch URL"
              className="h-10 pl-9 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
            />
          </div>
          <Button className="h-10 shrink-0" onClick={handleManualSubmit} disabled={manualLoading}>
            {manualLoading ? <Loader2 className="size-4 animate-spin" /> : "Go"}
          </Button>
        </div>
        {manualError && (
          <p className="text-xs text-red-500">{manualError}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

interface DaoReaderExtensionProps {
  sourceUrl: string | null;
  isAuthenticated: boolean;
}

export function DaoReaderExtension({ sourceUrl, isAuthenticated }: DaoReaderExtensionProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!!sourceUrl);
  const [waiting, setWaiting] = useState(!sourceUrl);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [error, setError] = useState("");
  const sourceTabIdRef = useRef<number | null>(null);

  // Linked book state
  const [linkedBook, setLinkedBook] = useState<BookSearchResult | null>(null);
  const [pickerDismissed, setPickerDismissed] = useState(false);

  // Prefetch cache
  const prefetchRef = useRef<Record<string, ExtractedData>>({});
  const prefetchingRef = useRef<string | null>(null);

  // Listen for extension content delivery (two-tab flow)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.content) {
        setWaiting(false);
        setLoading(false);
        processExtracted({
          url: detail.sourceUrl || "",
          domain: detail.domain || "",
          title: detail.title || "",
          content: detail.content,
          nextUrl: detail.nextUrl || null,
          prevUrl: detail.prevUrl || null,
        });
      }
    };
    document.addEventListener("daosearch-chapter", handler);
    return () => document.removeEventListener("daosearch-chapter", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get the source tab ID (the tab where user clicked "Read on DaoSearch")
  useEffect(() => {
    const extId = getExtId();
    if (!extId || !chromeApi?.runtime?.sendMessage) return;
    chromeApi.runtime.sendMessage(extId, { type: "get-source-tab" }, (resp: { tabId: number } | null) => {
      if (resp?.tabId) {
        sourceTabIdRef.current = resp.tabId;
      }
    });
  }, []);

  const processExtracted = useCallback((data: ExtractedData) => {
    setExtracted(data);
    window.scrollTo(0, 0);

    // Prefetch next chapter
    if (data.nextUrl && !prefetchRef.current[data.nextUrl]) {
      const nextUrl = data.nextUrl;
      prefetchingRef.current = nextUrl;
      fetchChapter(nextUrl).then(next => {
        if (next && prefetchingRef.current === nextUrl) {
          prefetchRef.current[nextUrl] = next;
        }
        prefetchingRef.current = null;
      });
    }
  }, []);

  // Initial load from extension storage (only when we have a sourceUrl)
  useEffect(() => {
    if (!sourceUrl) return;
    async function load() {
      try {
        const data = await getExtractedData();
        if (data?.content && Date.now() - (data as any).extractedAt < 300000) {
          processExtracted(data);
        } else {
          console.log("[DaoReader] No cached data, fetching:", sourceUrl);
          const fetched = await fetchChapter(sourceUrl!);
          if (fetched) { processExtracted(fetched); return; }
          setError("Could not extract content. Make sure the DaoSearch extension is installed.");
        }
      } catch {
        setError("Could not load content from extension.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sourceUrl, processExtracted]);

  /** Fetch + extract a chapter URL. */
  const fetchChapter = useCallback(async (url: string): Promise<ExtractedData | null> => {
    const html = await fetchPageViaExtension(url);
    if (html) {
      const data = extractFromHtml(html, url);
      if (data) return data;
    }
    if (sourceTabIdRef.current) {
      const data = await navigateAndExtract(url, sourceTabIdRef.current);
      if (data?.content) return data;
    }
    return null;
  }, []);

  const handleNavigate = useCallback(async (url: string) => {
    // Check prefetch cache first
    if (prefetchRef.current[url]) {
      processExtracted(prefetchRef.current[url]);
      delete prefetchRef.current[url];
      return;
    }
    const data = await fetchChapter(url);
    if (data) {
      processExtracted(data);
    }
  }, [processExtracted, fetchChapter]);

  const handleBack = useCallback(() => {
    setExtracted(null);
    setWaiting(true);
    setPickerDismissed(false);
  }, []);

  const handleBookSelect = useCallback((book: BookSearchResult) => {
    // Navigate to the full reader landing for this book
    router.push(readerUrl(book.id, book.titleTranslated || book.title));
  }, [router]);

  // ─── Waiting state: show book picker ──────────────────────

  if (waiting && !extracted) {
    return (
      <div className="flex flex-col gap-6 py-10 max-w-md mx-auto">
        <div className="text-center space-y-1">
          <Loader2 className="size-5 animate-spin text-muted-foreground mx-auto mb-3" />
          <h1 className="text-lg font-medium">Waiting for content...</h1>
          <p className="text-sm text-muted-foreground">
            Click the DaoSearch extension button on any chapter page to send it here
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or select a book to use the full reader</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <BookPicker onSelect={handleBookSelect} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading chapter...</p>
      </div>
    );
  }

  if (error && !extracted) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 max-w-md mx-auto text-center">
        <AlertCircle className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="size-4" />
            Back to DaoSearch
          </Button>
        </Link>
      </div>
    );
  }

  // ─── Reading state: ReaderView + book picker below ────────

  if (!extracted) return null;

  return (
    <div className="flex flex-col">
      <ReaderView
        bookId={linkedBook?.id ?? null}
        bookTitle={linkedBook ? (linkedBook.titleTranslated || linkedBook.title || "") : (extracted.domain || "External")}
        rawTitle={extracted.title}
        rawContent={extracted.content}
        nextUrl={extracted.nextUrl}
        prevUrl={extracted.prevUrl}
        sourceUrl={extracted.url}
        domain={extracted.domain}
        isAuthenticated={isAuthenticated}
        onNavigate={handleNavigate}
        onBack={handleBack}
      />

      {/* Book picker — shown below reader content, above sticky nav padding */}
      {!linkedBook && !pickerDismissed && (
        <div className="max-w-3xl mx-auto w-full px-4 pb-24 mt-6">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Link to a book</span>
              </div>
              <button
                onClick={() => setPickerDismissed(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Associate with a book to save progress and cache translations
            </p>
            <BookPicker onSelect={handleBookSelect} />
          </div>
        </div>
      )}

      {linkedBook && (
        <div className="max-w-3xl mx-auto w-full px-4 pb-24 mt-4">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <Check className="size-3.5 text-green-500 shrink-0" />
            <span className="text-xs text-muted-foreground">
              Linked to <span className="font-medium text-foreground">{linkedBook.titleTranslated || linkedBook.title}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
