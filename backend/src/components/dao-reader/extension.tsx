"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Readability } from "@mozilla/readability";

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

function extractFromHtml(html: string, url: string): ExtractedData | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);
  const domain = new URL(url).hostname;

  // Readability extraction
  let contentText: string | null = null;
  let title = "";
  try {
    const reader = new Readability(doc.cloneNode(true) as Document);
    const article = reader.parse();
    if (article?.content) {
      contentText = htmlToText(article.content);
      title = article.title || "";
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
    if (!href || href === "#") continue;
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

// ─── Component ───────────────────────────────────────────────

interface DaoReaderExtensionProps {
  sourceUrl: string;
  isAuthenticated: boolean;
}

export function DaoReaderExtension({ sourceUrl, isAuthenticated }: DaoReaderExtensionProps) {
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [currentUrl, setCurrentUrl] = useState(sourceUrl);
  const contentRef = useRef<HTMLDivElement>(null);
  const sourceTabIdRef = useRef<number | null>(null);

  // Prefetch cache
  const prefetchRef = useRef<Record<string, ExtractedData>>({});
  const prefetchingRef = useRef<string | null>(null);

  // Get the source tab ID (the tab where user clicked "Read on DaoSearch")
  useEffect(() => {
    const extId = getExtId();
    if (!extId || !chromeApi?.runtime?.sendMessage) return;
    chromeApi.runtime.sendMessage(extId, { type: "get-source-tab" }, (resp: { tabId: number } | null) => {
      if (resp?.tabId) {
        sourceTabIdRef.current = resp.tabId;
        console.log("[DaoReader] Source tab ID:", resp.tabId);
      } else {
        console.log("[DaoReader] No source tab ID from background, will use fetch-only mode");
      }
    });
  }, []);

  const processExtracted = useCallback((data: ExtractedData) => {
    setExtracted(data);
    setCurrentUrl(data.url);
    const paras = data.content
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    setParagraphs(paras);

    // Scroll to top
    contentRef.current?.scrollTo(0, 0);
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

  // Initial load from extension storage
  useEffect(() => {
    async function load() {
      try {
        const data = await getExtractedData();
        if (data?.content && Date.now() - (data as any).extractedAt < 300000) {
          processExtracted(data);
        } else {
          // Try fetching the URL directly via extension (static fetch → tab navigation fallback)
          console.log("[DaoReader] No cached data, fetching:", sourceUrl);
          const fetched = await fetchChapter(sourceUrl);
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

  /** Fetch + extract a chapter URL. Tries static fetch first, falls back to tab navigation for JS-rendered sites. */
  const fetchChapter = useCallback(async (url: string): Promise<ExtractedData | null> => {
    // Tier 1: static fetch (fast, works for most sites)
    const html = await fetchPageViaExtension(url);
    if (html) {
      const data = extractFromHtml(html, url);
      if (data) return data;
      console.log("[DaoReader] Static extraction failed for:", url, "HTML length:", html.length);
    }

    // Tier 2: navigate source tab and extract via content script (handles JS-rendered sites)
    if (sourceTabIdRef.current) {
      console.log("[DaoReader] Falling back to tab navigation for:", url, "tabId:", sourceTabIdRef.current);
      const data = await navigateAndExtract(url, sourceTabIdRef.current);
      console.log("[DaoReader] Tab navigation result:", data ? `${data.content?.length} chars` : "null");
      if (data?.content) return data;
    } else {
      console.log("[DaoReader] No source tab available for fallback");
    }

    return null;
  }, []);

  const navigateTo = useCallback(async (url: string) => {
    setNavigating(true);
    setError("");

    try {
      // Check prefetch cache first
      if (prefetchRef.current[url]) {
        processExtracted(prefetchRef.current[url]);
        delete prefetchRef.current[url];
        return;
      }

      const data = await fetchChapter(url);
      if (!data) {
        setError("Could not extract content from page.");
        return;
      }
      processExtracted(data);
    } catch {
      setError("Navigation failed.");
    } finally {
      setNavigating(false);
    }
  }, [processExtracted, fetchChapter]);

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

  return (
    <div className="flex flex-col gap-4" ref={contentRef}>
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground truncate">{extracted?.title || "Chapter"}</span>
        <span>·</span>
        <span className="truncate">{extracted?.domain}</span>
        <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 ml-auto">
          <ExternalLink className="size-3.5 hover:text-foreground transition-colors" />
        </a>
      </div>

      {/* Error banner */}
      {error && extracted && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Content */}
      {paragraphs.length > 0 && (
        <div className="rounded-lg border p-4 sm:p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            {paragraphs.length} paragraphs — translation coming soon
          </p>
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[15px] leading-[1.8] text-foreground/85">{p}</p>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between py-2 sticky bottom-0 bg-background/80 backdrop-blur-sm border-t -mx-4 px-4 sm:-mx-6 sm:px-6">
        <Button
          variant="outline"
          size="sm"
          disabled={!extracted?.prevUrl || navigating}
          onClick={() => extracted?.prevUrl && navigateTo(extracted.prevUrl)}
        >
          {navigating ? <Loader2 className="size-4 animate-spin" /> : <ChevronLeft className="size-4" />}
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!extracted?.nextUrl || navigating}
          onClick={() => extracted?.nextUrl && navigateTo(extracted.nextUrl)}
        >
          Next
          {navigating ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
        </Button>
      </div>

      {!isAuthenticated && (
        <p className="text-sm text-muted-foreground text-center py-2">
          Sign in to track progress and save translations.
        </p>
      )}
    </div>
  );
}
