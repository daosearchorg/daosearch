/**
 * DaoSearch Extension — Shared Config
 *
 * Single source of truth for DaoSearch URLs and hostname detection.
 * Change DAOSEARCH_URL here to switch between dev and prod.
 */

// ── Toggle this for dev vs prod ──
const DAOSEARCH_URL = "http://localhost:8080";
// const DAOSEARCH_URL = "https://daosearch.io";

const DAOSEARCH_HOSTNAMES = ["localhost", "daosearch.io", "www.daosearch.io"];

function isDaosearchPage(hostname) {
  return DAOSEARCH_HOSTNAMES.includes(hostname);
}

function isReaderUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return isDaosearchPage(parsed.hostname) && parsed.pathname.startsWith("/reader");
  } catch {
    return false;
  }
}
