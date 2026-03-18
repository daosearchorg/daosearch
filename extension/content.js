/**
 * DaoSearch Reader — Content Script
 * Detects Chinese novel content, extracts via Readability, sends to DaoSearch reader tab.
 */

const CHINESE_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
// DAOSEARCH_URL, isDaosearchPage, isReaderUrl loaded from config.js
const MIN_CHINESE_RATIO = 0.3;
const MIN_CHINESE_CHARS = 200;
const LOGO_SRC = chrome.runtime.getURL("icons/icon48.png");

let fabEl = null;
let detected = false;
let trainingOverlay = null;

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

function cleanTitle(title) {
  if (!title) return "";
  // Split on separators (with or without spaces — Chinese often omits spaces)
  const parts = title.split(/\s*[-–—|_]\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    // Return the first meaningful part (usually the chapter title)
    return parts[0];
  }
  return title.trim();
}

/** Try to extract chapter title from DOM before falling back to Readability */
function extractChapterTitle() {
  // 1. Look for heading elements with chapter patterns
  const headings = document.querySelectorAll("h1, h2, h3, .chapter-title, .title, .booktitle");
  const chapterRe = /第[\d一二三四五六七八九十百千万]+[章节回话篇卷集]|chapter\s*\d+/i;
  for (const h of headings) {
    const text = (h.textContent || "").trim();
    if (text && chapterRe.test(text) && text.length < 100) {
      return cleanTitle(text);
    }
  }
  // 2. Check any heading that's short enough to be a title
  for (const h of headings) {
    const text = (h.textContent || "").trim();
    if (text && text.length > 2 && text.length < 80) {
      return cleanTitle(text);
    }
  }
  return null;
}

function extractContent() {
  try {
    // Try DOM title extraction first (more reliable than Readability for Chinese sites)
    const domTitle = extractChapterTitle();

    const clone = document.cloneNode(true);
    const reader = new Readability(clone);
    const article = reader.parse();
    if (article && article.content) {
      // Use DOM title if available and looks like a chapter title, otherwise Readability's
      let title = domTitle || cleanTitle(article.title);
      // Validate: if title is too long (>100 chars), it's probably body text not a title
      if (title.length > 100) title = cleanTitle(document.title) || title.slice(0, 60);
      return { text: htmlToText(article.content), title };
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

// ─── Nav Link Detection ─────────────────────────────────────

async function detectNavLinks() {
  const domain = location.hostname;

  // Check stored patterns first (from training)
  try {
    const stored = await chrome.storage.local.get(`nav_pattern_${domain}`);
    const pattern = stored[`nav_pattern_${domain}`];
    if (pattern) {
      let nextUrl = null, prevUrl = null;
      if (pattern.nextSelector) {
        const el = document.querySelector(pattern.nextSelector);
        if (el?.href) nextUrl = el.href;
      }
      if (pattern.prevSelector) {
        const el = document.querySelector(pattern.prevSelector);
        if (el?.href) prevUrl = el.href;
      }
      if (nextUrl || prevUrl) return { nextUrl, prevUrl, fromPattern: true };
    }
  } catch (e) {
    console.log("[DaoSearch] Pattern lookup failed:", e);
  }

  // Heuristic detection
  const navKeywords = {
    next: ['下一章', '下一页', '下章', 'next', '下一节'],
    prev: ['上一章', '上一页', '上章', 'prev', '上一节'],
  };

  let nextUrl = null, prevUrl = null;
  for (const link of document.querySelectorAll("a")) {
    const text = (link.innerText || "").trim().toLowerCase();
    const href = link.href;
    if (!href || href === "#" || href === location.href || href.startsWith("javascript:")) continue;
    if (!nextUrl && navKeywords.next.some(k => text.includes(k))) nextUrl = href;
    if (!prevUrl && navKeywords.prev.some(k => text.includes(k))) prevUrl = href;
    if (nextUrl && prevUrl) break;
  }
  return { nextUrl, prevUrl, fromPattern: false };
}

// ─── CSS Selector Builder ────────────────────────────────────

function buildSelector(el) {
  const parts = [];
  let current = el;
  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${CSS.escape(current.id)}`;
      parts.unshift(selector);
      break;
    }
    if (current.className && typeof current.className === "string") {
      const classes = current.className.trim().split(/\s+/).filter(c => c.length > 0).slice(0, 3);
      if (classes.length > 0) {
        selector += classes.map(c => `.${CSS.escape(c)}`).join("");
      }
    }
    // Add nth-child for disambiguation
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

// ─── Training Mode ───────────────────────────────────────────

function showTrainingOverlay(linkType) {
  removeTrainingOverlay();

  const label = linkType === "next" ? "NEXT CHAPTER" : "PREVIOUS CHAPTER";

  trainingOverlay = document.createElement("div");
  trainingOverlay.id = "daosearch-training";
  trainingOverlay.attachShadow({ mode: "open" });
  trainingOverlay.shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 999998;
        pointer-events: none;
      }
      .banner {
        pointer-events: auto;
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: #18181b;
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 999999;
      }
      .cancel-btn {
        background: rgba(255,255,255,0.15);
        color: white;
        border: none;
        padding: 6px 14px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        font-family: inherit;
      }
      .cancel-btn:hover { background: rgba(255,255,255,0.25); }
    </style>
    <div class="banner">
      <span>Click the ${label} link on this page</span>
      <button class="cancel-btn">Cancel</button>
    </div>
  `;

  document.body.appendChild(trainingOverlay);

  // Add highlight style for links
  const highlightStyle = document.createElement("style");
  highlightStyle.id = "daosearch-training-style";
  highlightStyle.textContent = `
    a:hover {
      outline: 3px solid #22c55e !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
    }
  `;
  document.head.appendChild(highlightStyle);

  return new Promise((resolve) => {
    const cancelBtn = trainingOverlay.shadowRoot.querySelector(".cancel-btn");
    cancelBtn.addEventListener("click", () => {
      removeTrainingOverlay();
      resolve(null);
    });

    const clickHandler = (e) => {
      const link = e.target.closest("a[href]");
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener("click", clickHandler, true);
      removeTrainingOverlay();
      resolve({ url: link.href, selector: buildSelector(link) });
    };

    document.addEventListener("click", clickHandler, true);
  });
}

function removeTrainingOverlay() {
  if (trainingOverlay) {
    trainingOverlay.remove();
    trainingOverlay = null;
  }
  const style = document.getElementById("daosearch-training-style");
  if (style) style.remove();
}

async function trainNavLinks(nav) {
  const domain = location.hostname;
  let nextSelector = null, prevSelector = null;

  // Only train for links that weren't detected
  if (!nav.nextUrl) {
    const result = await showTrainingOverlay("next");
    if (result) {
      nav.nextUrl = result.url;
      nextSelector = result.selector;
    }
  }

  if (!nav.prevUrl) {
    const result = await showTrainingOverlay("prev");
    if (result) {
      nav.prevUrl = result.url;
      prevSelector = result.selector;
    }
  }

  // Save patterns if we got any
  if (nextSelector || prevSelector) {
    // Load existing patterns for this domain
    const storageKey = `nav_pattern_${domain}`;
    const stored = await chrome.storage.local.get(storageKey);
    const existing = stored[storageKey] || {};
    const pattern = {
      nextSelector: nextSelector || existing.nextSelector || null,
      prevSelector: prevSelector || existing.prevSelector || null,
      trainedAt: Date.now(),
    };

    // Save locally
    await chrome.storage.local.set({ [storageKey]: pattern });

    // POST to DaoSearch API (best-effort, don't block)
    try {
      fetch(`${DAOSEARCH_URL}/api/reader/nav-patterns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          nextSelector: pattern.nextSelector,
          prevSelector: pattern.prevSelector,
        }),
      }).catch(() => {});
    } catch (e) {
      // ignore
    }
  }

  return nav;
}

// ─── FAB ─────────────────────────────────────────────────────

function showFab() {
  if (fabEl) return;

  fabEl = document.createElement("div");
  fabEl.id = "daosearch-fab";
  fabEl.attachShadow({ mode: "open" });

  updateFabContent("Send to Reader");

  fabEl.shadowRoot.querySelector(".fab").addEventListener("click", handleRead);
  document.body.appendChild(fabEl);
}

function updateFabContent(label) {
  if (!fabEl) return;
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
      <span>${label}</span>
    </div>
  `;
  fabEl.shadowRoot.querySelector(".fab").addEventListener("click", handleRead);
}

function checkReaderTab() {
  chrome.runtime.sendMessage({ type: "check-reader-tab" }, (response) => {
    if (response?.hasReaderTab) {
      updateFabContent("Send to Reader");
    }
  });
}

// ─── Read Action ─────────────────────────────────────────────

async function handleRead() {
  const extracted = extractContent();
  if (!extracted) {
    console.log("[DaoSearch] Could not extract content");
    return;
  }

  const nav = await detectNavLinks();

  // If no next link detected and not from pattern, offer training
  if (!nav.nextUrl && !nav.fromPattern) {
    await trainNavLinks(nav);
  }

  const payload = {
    content: extracted.text,
    title: extracted.title,
    nextUrl: nav.nextUrl,
    prevUrl: nav.prevUrl,
    sourceUrl: location.href,
    domain: location.hostname,
  };

  // Send to background to relay to reader tab
  chrome.runtime.sendMessage({ type: "send-to-reader", data: payload }, (response) => {
    if (response?.sent) {
      // Briefly show success state on FAB
      updateFabContent("Sent!");
      setTimeout(() => updateFabContent("Send to Reader"), 1500);
    }
  });
}

// ─── DaoSearch Page Listener ─────────────────────────────────

function initDaoSearchListener() {
  // On DaoSearch pages: inject extension ID and listen for chapter deliveries
  document.documentElement.setAttribute("data-daosearch-ext-id", chrome.runtime.id);

  // Listen for reader waiting state changes and relay to background
  document.addEventListener("daosearch-reader-waiting", (e) => {
    const waiting = e.detail?.waiting ?? false;
    chrome.runtime.sendMessage({ type: "reader-waiting-changed", waiting });
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "deliver-chapter" && msg.data) {
      // Bridge from extension to web app via CustomEvent
      document.dispatchEvent(new CustomEvent("daosearch-chapter", {
        detail: {
          content: msg.data.content,
          title: msg.data.title,
          nextUrl: msg.data.nextUrl,
          prevUrl: msg.data.prevUrl,
          sourceUrl: msg.data.sourceUrl,
          domain: msg.data.domain,
        },
      }));
      sendResponse({ ok: true });
    }
    return true;
  });
}

// ─── Init ────────────────────────────────────────────────────

function init() {
  // On DaoSearch pages: set up listener for chapter delivery
  if (isDaosearchPage(location.hostname)) {
    initDaoSearchListener();
    return;
  }

  if (detectChineseContent()) {
    detected = true;
    chrome.runtime.sendMessage({
      type: "chinese-detected",
      url: location.href,
      title: document.title,
    });
    // Only show FAB if a reader tab is actively waiting for content
    chrome.runtime.sendMessage({ type: "check-reader-tab" }, (response) => {
      if (response?.isWaiting) showFab();
    });
  }
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "extract") {
    (async () => {
      const extracted = extractContent();
      const nav = await detectNavLinks();
      sendResponse({
        detected,
        url: location.href,
        domain: location.hostname,
        title: extracted?.title || document.title,
        content: extracted?.text || null,
        nextUrl: nav.nextUrl,
        prevUrl: nav.prevUrl,
      });
    })();
    return true;
  }
  if (msg.type === "ping") {
    sendResponse({ detected });
    return true;
  }
  // Don't return true for unhandled messages — let other listeners handle them
  return false;
});

function tryInit() {
  if (detected) return;
  init();
  // If not detected yet, retry after JS frameworks render (SPA pages)
  if (!detected && !isDaosearchPage(location.hostname)) {
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
