/**
 * DaoSearch Reader — Popup
 * Shows tab status, send-to-reader button, library link.
 */

// DAOSEARCH_URL, isDaosearchPage loaded from config.js

const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const readBtn = document.getElementById("read-btn");

let currentTab = null;

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { statusText.textContent = "No active tab"; return; }
    currentTab = tab;

    if (tab.url && (isDaosearchPage(new URL(tab.url).hostname))) {
      statusText.textContent = "You're on DaoSearch";
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "ping" });
      if (response?.detected) {
        statusEl.className = "status detected";
        statusText.textContent = "Chinese content detected";
        readBtn.disabled = false;
        readBtn.querySelector("span").textContent = "Read on DaoSearch";
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

  readBtn.disabled = true;
  readBtn.querySelector("span").textContent = "Extracting...";

  try {
    const data = await chrome.tabs.sendMessage(currentTab.id, { type: "extract" });
    if (data?.content) {
      const payload = {
        content: data.content,
        title: data.title,
        nextUrl: data.nextUrl,
        prevUrl: data.prevUrl,
        sourceUrl: data.url,
        domain: data.domain,
      };

      // Send via background to reader tab (two-tab flow)
      chrome.runtime.sendMessage({ type: "send-to-reader", data: payload }, (response) => {
        if (response?.sent) {
          readBtn.querySelector("span").textContent = "Sent!";
        } else {
          readBtn.querySelector("span").textContent = "Failed to send";
        }
        setTimeout(() => window.close(), 800);
      });
    } else {
      statusText.textContent = "Failed to extract content";
      readBtn.disabled = false;
      readBtn.querySelector("span").textContent = "Read on DaoSearch";
    }
  } catch {
    statusText.textContent = "Failed to extract content";
    readBtn.disabled = false;
    readBtn.querySelector("span").textContent = "Read on DaoSearch";
  }
});

document.getElementById("browse-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: `${DAOSEARCH_URL}/library` });
  window.close();
});

// Set site link to match current environment
document.getElementById("site-link").href = DAOSEARCH_URL;

checkCurrentTab();
