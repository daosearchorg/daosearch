/**
 * DaoSearch Reader — Popup
 * Simple: detect page, "Read on DaoSearch" button.
 */

const DAOSEARCH_URL = "http://localhost:8080";

const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const readBtn = document.getElementById("read-btn");

let currentTab = null;

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { statusText.textContent = "No active tab"; return; }
    currentTab = tab;

    if (tab.url?.includes("daosearch.com") || tab.url?.includes("localhost:8080")) {
      statusText.textContent = "You're on DaoSearch";
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "ping" });
      if (response?.detected) {
        statusEl.className = "status detected";
        statusText.textContent = "Chinese content detected";
        readBtn.disabled = false;
      } else {
        statusText.textContent = "No Chinese content on this page";
      }
    } catch {
      statusText.textContent = "No Chinese content detected";
    }
  } catch {
    statusText.textContent = "Unable to check this page";
  }
}

readBtn.addEventListener("click", async () => {
  if (!currentTab?.id) return;

  // Tell the content script to extract and open reader
  try {
    const data = await chrome.tabs.sendMessage(currentTab.id, { type: "extract" });
    if (data?.content) {
      await chrome.storage.local.set({
        lastExtracted: {
          url: data.url,
          domain: data.domain,
          title: data.title,
          content: data.content,
          nextUrl: data.nextUrl,
          prevUrl: data.prevUrl,
          extractedAt: Date.now(),
        },
        sourceTabId: currentTab.id,
      });

      const readerUrl = `${DAOSEARCH_URL}/reader?ext=1&url=${encodeURIComponent(data.url)}`;
      chrome.tabs.create({ url: readerUrl });
      window.close();
    }
  } catch {
    statusText.textContent = "Failed to extract content";
  }
});

document.getElementById("browse-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: `${DAOSEARCH_URL}/library` });
  window.close();
});

checkCurrentTab();
