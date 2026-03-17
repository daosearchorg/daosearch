/**
 * DaoSearch Reader — Background Service Worker
 *
 * Handles tab management, two-tab content relay, and prefetching.
 */

// Track tabs with Chinese content detected
const chineseTabs = new Map();
// Track which tab was the source when opening the reader
let lastSourceTabId = null;
// Prefetch cache: url -> html
const prefetchCache = new Map();
// Max prefetch cache entries
const MAX_PREFETCH = 10;

// ─── Helpers ─────────────────────────────────────────────────

async function findReaderTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find(t =>
    t.url && (
      t.url.match(/localhost:8080\/reader/) ||
      t.url.match(/daosearch\.com\/reader/)
    )
  ) || null;
}

function fetchPageHtml(url) {
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  })
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const header = new TextDecoder("latin1").decode(buf.slice(0, 4000));
      const charsetMatch = header.match(/charset\s*=\s*["']?\s*([\w-]+)/i);
      const charset = (charsetMatch?.[1] || "").toLowerCase();
      const isGbk = charset === "gbk" || charset === "gb2312" || charset === "gb18030";
      return new TextDecoder(isGbk ? "gbk" : "utf-8", { fatal: false }).decode(buf);
    });
}

function prefetchUrl(url) {
  if (!url || prefetchCache.has(url)) return;
  // Evict oldest entries if cache is full
  if (prefetchCache.size >= MAX_PREFETCH) {
    const firstKey = prefetchCache.keys().next().value;
    prefetchCache.delete(firstKey);
  }
  fetchPageHtml(url)
    .then(html => {
      prefetchCache.set(url, html);
      console.log("[DaoSearch] Prefetched:", url);
    })
    .catch(() => {});
}

// ─── External Messages (from DaoSearch web app) ──────────────

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get-extracted") {
    chrome.storage.local.get("lastExtracted", (result) => {
      sendResponse(result.lastExtracted || null);
    });
    return true;
  }
  if (msg.type === "ping") {
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "get-source-tab") {
    if (lastSourceTabId) {
      sendResponse({ tabId: lastSourceTabId });
    } else {
      chrome.storage.local.get("sourceTabId", (result) => {
        sendResponse({ tabId: result.sourceTabId || null });
      });
    }
    return true;
  }
  if (msg.type === "prefetch") {
    prefetchUrl(msg.url);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "fetch-page") {
    // Check prefetch cache first
    if (prefetchCache.has(msg.url)) {
      const html = prefetchCache.get(msg.url);
      prefetchCache.delete(msg.url);
      sendResponse({ ok: true, html });
      return true;
    }

    fetchPageHtml(msg.url)
      .then((html) => sendResponse({ ok: true, html }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "navigate-and-extract") {
    const tabId = msg.tabId;
    const url = msg.url;

    chrome.tabs.update(tabId, { url }, () => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { type: "extract" }, (response) => {
              sendResponse(response || null);
            });
          }, 1000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        sendResponse(null);
      }, 15000);
    });
    return true;
  }
});

// ─── Internal Messages (from content scripts & popup) ────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get-current-tab-id") {
    sendResponse(sender.tab?.id || null);
    return true;
  }

  if (msg.type === "chinese-detected" && sender.tab) {
    chineseTabs.set(sender.tab.id, {
      url: msg.url,
      title: msg.title,
    });
    chrome.action.setBadgeText({ text: "中", tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#18181b", tabId: sender.tab.id });
  }

  if (msg.type === "open-reader") {
    if (sender.tab?.id) lastSourceTabId = sender.tab.id;
    chrome.tabs.create({ url: msg.url });
  }

  if (msg.type === "check-reader-tab") {
    findReaderTab().then(tab => {
      sendResponse({ hasReaderTab: !!tab });
    });
    return true;
  }

  if (msg.type === "send-to-reader") {
    (async () => {
      try {
        let readerTab = await findReaderTab();

        if (!readerTab) {
          // No reader tab open — open one and wait for it to load
          const DAOSEARCH_URL = "http://localhost:8080";
          const newTab = await chrome.tabs.create({
            url: `${DAOSEARCH_URL}/reader?ext=1`,
          });

          // Wait for the tab to finish loading
          await new Promise((resolve) => {
            const listener = (tabId, changeInfo) => {
              if (tabId === newTab.id && changeInfo.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(() => {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }, 10000);
          });

          // Wait for content script to initialize
          await new Promise(r => setTimeout(r, 1000));
          readerTab = newTab;
        }

        // Send content to the reader tab's content script
        // Retry up to 3 times in case content script isn't ready yet
        let sent = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await new Promise((resolve) => {
              chrome.tabs.sendMessage(readerTab.id, {
                type: "deliver-chapter",
                data: msg.data,
              }, (resp) => {
                // Check for chrome.runtime.lastError to avoid unchecked error
                if (chrome.runtime.lastError) {
                  console.log("[DaoSearch] sendMessage error:", chrome.runtime.lastError.message);
                  resolve(null);
                } else {
                  resolve(resp);
                }
              });
            });
            if (response?.ok) {
              sent = true;
              break;
            }
          } catch (e) {
            console.log("[DaoSearch] deliver attempt", attempt + 1, "failed:", e);
          }
          // Wait before retry
          if (attempt < 2) await new Promise(r => setTimeout(r, 800));
        }

        sendResponse({ sent });

        // Prefetch next chapter in background
        if (msg.data?.nextUrl) {
          prefetchUrl(msg.data.nextUrl);
        }
      } catch (e) {
        console.log("[DaoSearch] send-to-reader error:", e);
        sendResponse({ sent: false });
      }
    })();
    return true;
  }

  if (msg.type === "open-popup") {
    chrome.action.openPopup().catch(() => {});
  }
});

// ─── Tab Cleanup ─────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  chineseTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    chineseTabs.delete(tabId);
    chrome.action.setBadgeText({ text: "", tabId });
  }
});
