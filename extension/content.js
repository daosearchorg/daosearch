/**
 * DaoSearch Reader — Content Script
 * Detects Chinese novel content, extracts via Readability, opens DaoSearch reader.
 */

const CHINESE_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const DAOSEARCH_URL = "http://localhost:8080";
const MIN_CHINESE_RATIO = 0.3;
const MIN_CHINESE_CHARS = 200;
const LOGO_SRC = chrome.runtime.getURL("icons/icon48.png");

let fabEl = null;
let detected = false;

// ─── Detection ───────────────────────────────────────────────

function detectChineseContent() {
  // Quick check: known novel reader URL patterns
  const url = location.href;
  const knownPatterns = [
    /fanqienovel\.com\/reader/,
    /book\.qq\.com\/book-read/,
    /69shuba\.(com|tw)\/txt\//,
    /twkan\.com\/read\//,
    /novel543\.com\/read\//,
    /uukanshu\.cc\/book\//,
    /bixiange\.me\/.+\//,
    /ffxs8\.com\/.+\//,
    /shuhaige\.net\/.+\//,
    /trxs\.cc\/.+\//,
    /mokakanshu\.vip\/.+\//,
    /ixdzs8\.com\/.+\//,
  ];
  if (knownPatterns.some(p => p.test(url))) return true;

  // Check meta tags for novel-related content
  const metaNovel = document.querySelector('meta[property="og:type"][content*="novel"]') ||
    document.querySelector('meta[property="og:novel:book_name"]') ||
    document.querySelector('meta[name="keywords"]')?.getAttribute("content")?.match(/小说|章节|阅读/);
  if (metaNovel) return true;

  // General Chinese content ratio check (use innerText of main content, not full body)
  const mainEl = document.querySelector("article, main, .content, .reader-content, .muye-reader-content, #content") || document.body;
  const text = mainEl?.innerText || "";
  if (text.length < 300) return false;
  let cn = 0;
  for (const ch of text) { if (CHINESE_RE.test(ch)) cn++; }
  return cn >= MIN_CHINESE_CHARS && cn / text.length > MIN_CHINESE_RATIO;
}

// ─── Extraction ──────────────────────────────────────────────

function extractContent() {
  try {
    const clone = document.cloneNode(true);
    const reader = new Readability(clone);
    const article = reader.parse();
    if (article && article.content) {
      return { text: htmlToText(article.content), title: article.title || "" };
    }
  } catch (e) {
    console.log("[DaoSearch] Readability failed:", e);
  }
  return null;
}

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  for (const el of div.querySelectorAll("script, style, noscript")) el.remove();
  for (const el of div.querySelectorAll("p, div, br, li, h1, h2, h3, h4, h5, h6, tr")) {
    if (el.tagName === "BR") el.replaceWith("\n");
    else el.insertAdjacentText("afterend", "\n");
  }
  const lines = (div.textContent || "").split("\n");
  return lines
    .map(l => l.replace(/\s+/g, " ").trim())
    .filter(l => l.length > 0)
    .filter(l => !/^\d{1,4}$/.test(l))
    .filter(l => !/^[\d\s.,]+$/.test(l))
    .join("\n");
}

function detectNavLinks() {
  const next = ["下一章", "下一节", "下一页", "下章", "next"];
  const prev = ["上一章", "上一节", "上一页", "上章", "prev"];
  let nextUrl = null, prevUrl = null;
  for (const link of document.querySelectorAll("a")) {
    const text = (link.innerText || "").trim().toLowerCase();
    const href = link.href;
    if (!href || href === "#" || href === location.href) continue;
    if (!nextUrl && next.some(p => text.includes(p))) nextUrl = href;
    if (!prevUrl && prev.some(p => text.includes(p))) prevUrl = href;
    if (nextUrl && prevUrl) break;
  }
  return { nextUrl, prevUrl };
}

// ─── FAB ─────────────────────────────────────────────────────

function showFab() {
  if (fabEl) return;

  fabEl = document.createElement("div");
  fabEl.id = "daosearch-fab";
  fabEl.attachShadow({ mode: "open" });
  fabEl.shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
      }
      .fab {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #18181b;
        color: white;
        padding: 12px 20px;
        border-radius: 14px;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
        font-size: 15px;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        transition: transform 0.15s, box-shadow 0.15s;
        user-select: none;
      }
      .fab:hover { transform: scale(1.03); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
      .fab:active { transform: scale(0.98); }
      .fab img { width: 20px; height: 20px; border-radius: 4px; }
    </style>
    <div class="fab">
      <img src="${LOGO_SRC}" alt="">
      <span>Read on DaoSearch</span>
    </div>
  `;

  fabEl.shadowRoot.querySelector(".fab").addEventListener("click", handleRead);
  document.body.appendChild(fabEl);
}

// ─── Read Action ─────────────────────────────────────────────

async function handleRead() {
  const extracted = extractContent();
  if (!extracted) {
    console.log("[DaoSearch] Could not extract content");
    return;
  }

  const nav = detectNavLinks();

  await chrome.storage.local.set({
    lastExtracted: {
      url: location.href,
      domain: location.hostname,
      title: extracted.title,
      content: extracted.text,
      nextUrl: nav.nextUrl,
      prevUrl: nav.prevUrl,
      extractedAt: Date.now(),
    },
    sourceTabId: (await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "get-current-tab-id" }, resolve);
    })) || null,
  });

  const readerUrl = `${DAOSEARCH_URL}/reader?ext=1&url=${encodeURIComponent(location.href)}`;
  chrome.runtime.sendMessage({ type: "open-reader", url: readerUrl });
}

// ─── Init ────────────────────────────────────────────────────

function init() {
  // On DaoSearch pages: inject extension ID for communication
  if (
    location.hostname === "daosearch.com" ||
    location.hostname === "www.daosearch.com" ||
    location.hostname === "localhost"
  ) {
    document.documentElement.setAttribute("data-daosearch-ext-id", chrome.runtime.id);
    return;
  }

  if (detectChineseContent()) {
    detected = true;
    showFab();
    chrome.runtime.sendMessage({
      type: "chinese-detected",
      url: location.href,
      title: document.title,
    });
  }
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "extract") {
    const extracted = extractContent();
    const nav = detectNavLinks();
    sendResponse({
      detected,
      url: location.href,
      domain: location.hostname,
      title: extracted?.title || document.title,
      content: extracted?.text || null,
      nextUrl: nav.nextUrl,
      prevUrl: nav.prevUrl,
    });
  }
  if (msg.type === "ping") {
    sendResponse({ detected });
  }
  return true;
});

function tryInit() {
  if (detected) return;
  init();
  // If not detected yet, retry after JS frameworks render (SPA pages)
  if (!detected) {
    let retries = 0;
    const observer = new MutationObserver(() => {
      retries++;
      if (retries > 20) { observer.disconnect(); return; }
      if (!detected) init();
      if (detected) observer.disconnect();
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    // Also timeout-based retry for slow SPAs
    setTimeout(() => { if (!detected) init(); }, 2000);
    setTimeout(() => { if (!detected) init(); observer.disconnect(); }, 5000);
  }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  tryInit();
} else {
  document.addEventListener("DOMContentLoaded", tryInit);
}
