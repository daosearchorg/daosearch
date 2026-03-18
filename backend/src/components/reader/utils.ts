"use client";

import { Readability } from "@mozilla/readability";

export interface ExtractedData {
  url: string;
  domain: string;
  title: string;
  content: string;
  nextUrl: string | null;
  prevUrl: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chromeApi = typeof window !== "undefined" ? (window as any).chrome : null;

export function getExtId(): string | null {
  return document.documentElement.getAttribute("data-daosearch-ext-id");
}

/** Ask the extension background to fetch a page's HTML (bypasses CORS). */
export async function fetchPageViaExtension(url: string): Promise<string | null> {
  const extId = getExtId();
  if (!extId || !chromeApi?.runtime?.sendMessage) return null;

  return new Promise((resolve) => {
    chromeApi.runtime.sendMessage(extId, { type: "fetch-page", url }, (resp: { ok: boolean; html?: string; error?: string } | null) => {
      if (resp?.ok && resp.html) resolve(resp.html);
      else resolve(null);
    });
  });
}

/** Fetch via background tab — bypasses Cloudflare by loading in a real browser tab. */
export async function fetchViaTab(url: string): Promise<ExtractedData | null> {
  const extId = getExtId();
  if (!extId || !chromeApi?.runtime?.sendMessage) return null;

  return new Promise((resolve) => {
    chromeApi.runtime.sendMessage(extId, { type: "fetch-via-tab", url }, (resp: ExtractedData | null) => {
      resolve(resp || null);
    });
  });
}

/** Navigate source tab to URL, wait for JS to render, then extract via content script. */
export async function navigateAndExtract(url: string, sourceTabId: number): Promise<ExtractedData | null> {
  const extId = getExtId();
  if (!extId || !chromeApi?.runtime?.sendMessage) return null;

  return new Promise((resolve) => {
    chromeApi.runtime.sendMessage(extId, { type: "navigate-and-extract", url, tabId: sourceTabId }, (resp: ExtractedData | null) => {
      resolve(resp || null);
    });
  });
}

/** Ask extension for the initially extracted data. */
export async function getExtractedData(): Promise<ExtractedData | null> {
  const extId = getExtId();
  if (!extId || !chromeApi?.runtime?.sendMessage) return null;

  return new Promise((resolve) => {
    chromeApi.runtime.sendMessage(extId, { type: "get-extracted" }, (response: ExtractedData | null) => {
      resolve(response || null);
    });
  });
}

/** Convert Readability HTML to clean paragraph text. */
export function htmlToText(html: string): string {
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

/** Strip book title, site name, and junk from raw chapter title. */
export function cleanChapterTitle(raw: string, bookTitle?: string, bookTitleRaw?: string): string {
  if (!raw) return "";
  let title = raw.trim();

  if (bookTitleRaw) {
    const escaped = bookTitleRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(escaped, "g"), "").trim();
  }
  if (bookTitle) {
    const escaped = bookTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(escaped, "gi"), "").trim();
  }

  const parts = title.split(/\s*[-–—|_]\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    title = parts[0];
  }

  title = title.replace(/^[\s\-–—|_:·]+|[\s\-–—|_:·]+$/g, "").trim();
  return title || raw;
}

/** Extract chapter number from Chinese title like 第3章, Chapter 3, etc. */
export function extractChapterSeq(title: string): number | null {
  const cnMatch = title.match(/第\s*(\d+)\s*[章节回]/);
  if (cnMatch) return parseInt(cnMatch[1], 10);
  const enMatch = title.match(/(?:chapter|ch\.?)\s*(\d+)/i);
  if (enMatch) return parseInt(enMatch[1], 10);
  const numMatch = title.match(/^\s*(\d+)\s*[.:\s]/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return null;
}

export function extractFromHtml(html: string, url: string): ExtractedData | null {
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
