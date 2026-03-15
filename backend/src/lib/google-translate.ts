/**
 * Client-side Google Translate helper.
 * Calls translate.googleapis.com directly from the browser — no server proxy.
 */

const GT_URL = "https://translate.googleapis.com/translate_a/single";

const CHINESE_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const CJK_PUNCT_RE = /[\u3000-\u303f\u30fb\ufe30-\ufe4f\u4e36]/g;

function hasChinese(text: string): boolean {
  return CHINESE_RE.test(text);
}

function clean(text: string): string {
  if (!text) return text;
  text = text.replace(CJK_PUNCT_RE, "");
  text = text.replace(/ {2,}/g, " ");
  text = text.replace(/([.!?,;:])([A-Za-z])/g, "$1 $2");
  text = text.replace(/\u201c/g, '"').replace(/\u201d/g, '"');
  text = text.replace(/\u2018/g, "'").replace(/\u2019/g, "'");
  return text.trim();
}

const MAX_RETRIES = 3;

// Rate limit state — consumers can subscribe
let _rateLimited = false;
const _rateLimitListeners = new Set<(limited: boolean) => void>();

export function onRateLimitChange(cb: (limited: boolean) => void) {
  _rateLimitListeners.add(cb);
  return () => _rateLimitListeners.delete(cb);
}

function setRateLimited(val: boolean) {
  if (_rateLimited === val) return;
  _rateLimited = val;
  _rateLimitListeners.forEach((cb) => cb(val));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function translateText(
  text: string,
  source = "zh",
  target = "en",
): Promise<string> {
  if (!text.trim()) return text;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const params = new URLSearchParams({
      client: "gtx",
      sl: source,
      tl: target,
      dt: "t",
      q: text,
    });

    try {
      const res = await fetch(`${GT_URL}?${params}`);
      if (res.status === 429) {
        setRateLimited(true);
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`GT ${res.status}`);

      setRateLimited(false);
      const data = await res.json();
      const raw = (data[0] as [string, string][])
        .map((seg) => seg[0])
        .join("");

      const translated = clean(raw);
      if (!translated) return text;

      if (hasChinese(translated) && attempt < MAX_RETRIES - 1) {
        await sleep(300 * (attempt + 1));
        continue;
      }

      return translated;
    } catch {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      return text;
    }
  }
  return text;
}

export async function translateBatch(
  texts: string[],
  source = "zh",
  target = "en",
): Promise<string[]> {
  if (!texts.length) return [];

  const needsTranslation: number[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (texts[i] && texts[i].trim() && hasChinese(texts[i])) {
      needsTranslation.push(i);
    }
  }
  if (!needsTranslation.length) return [...texts];

  const toTranslate = needsTranslation.map((i) =>
    texts[i].replace(/\n/g, " ").trim(),
  );
  const joined = toTranslate.join("\n");

  const params = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
  });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(GT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          ...Object.fromEntries(params),
          q: joined,
        }),
      });

      if (res.status === 429) {
        setRateLimited(true);
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`GT ${res.status}`);

      setRateLimited(false);
      const data = await res.json();
      const raw = (data[0] as [string, string][])
        .map((seg) => seg[0])
        .join("");

      const full = clean(raw);
      const parts = full.split("\n");

      const result = [...texts];
      for (let j = 0; j < needsTranslation.length; j++) {
        const idx = needsTranslation[j];
        if (j < parts.length && parts[j].trim()) {
          result[idx] = parts[j].trim();
        }
      }

      const chineseRemaining = needsTranslation.filter(
        (idx) => hasChinese(result[idx]),
      ).length;
      if (
        chineseRemaining > needsTranslation.length * 0.3 &&
        attempt < MAX_RETRIES - 1
      ) {
        await sleep(300 * (attempt + 1));
        continue;
      }

      return result;
    } catch {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      return texts;
    }
  }
  return texts;
}
