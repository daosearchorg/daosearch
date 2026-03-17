/**
 * DaoSearch Reader — Background Service Worker
 *
 * Handles tab management and message routing.
 */

// Track tabs with Chinese content detected
const chineseTabs = new Map();
// Track which tab was the source when opening the reader
let lastSourceTabId = null;

// Handle messages from the DaoSearch web app (externally_connectable)
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
    // Try memory first, then storage (popup saves to storage)
    if (lastSourceTabId) {
      sendResponse({ tabId: lastSourceTabId });
    } else {
      chrome.storage.local.get("sourceTabId", (result) => {
        sendResponse({ tabId: result.sourceTabId || null });
      });
    }
    return true;
  }
  if (msg.type === "fetch-page") {
    // Fetch page HTML — extension bypasses CORS
    // Always fetch as arrayBuffer so we can detect encoding from meta tags
    fetch(msg.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    })
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        // First pass: decode header as latin1 (preserves all bytes) to find charset
        const header = new TextDecoder("latin1").decode(buf.slice(0, 4000));
        const charsetMatch = header.match(/charset\s*=\s*["']?\s*([\w-]+)/i);
        const charset = (charsetMatch?.[1] || "").toLowerCase();
        const isGbk = charset === "gbk" || charset === "gb2312" || charset === "gb18030";
        const html = new TextDecoder(isGbk ? "gbk" : "utf-8", { fatal: false }).decode(buf);
        sendResponse({ ok: true, html });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "navigate-and-extract") {
    // Navigate a tab to a URL and extract content after load
    // Used for JS-rendered sites where fetch() won't get the content
    const tabId = msg.tabId;
    const url = msg.url;

    chrome.tabs.update(tabId, { url }, () => {
      // Wait for the tab to finish loading, then extract
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          // Give JS a moment to render
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { type: "extract" }, (response) => {
              sendResponse(response || null);
            });
          }, 1000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      // Timeout after 15s
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        sendResponse(null);
      }, 15000);
    });
    return true;
  }
});

// Handle messages from content scripts
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
    // Show badge on extension icon
    chrome.action.setBadgeText({ text: "中", tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#18181b", tabId: sender.tab.id });
  }

  if (msg.type === "open-reader") {
    // Remember which tab was the source
    if (sender.tab?.id) lastSourceTabId = sender.tab.id;
    chrome.tabs.create({ url: msg.url });
  }

  if (msg.type === "open-popup") {
    // Chrome 99+: programmatically open the action popup
    chrome.action.openPopup().catch(() => {
      // Fallback: if openPopup not supported, just notify user
    });
  }
});

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  chineseTabs.delete(tabId);
});

// Clean up when tab navigates away
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    chineseTabs.delete(tabId);
    chrome.action.setBadgeText({ text: "", tabId });
  }
});
