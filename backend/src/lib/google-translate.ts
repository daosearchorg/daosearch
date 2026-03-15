/**
 * Client-side Google Translate helper.
 * Calls translate.googleapis.com directly from the browser.
 * Falls back to /api/translate proxy if CORS blocks the request.
 */

const GT_URL = "https://translate.googleapis.com/translate_a/single";

let useFallback = false;

export async function translateText(
  text: string,
  source = "zh",
  target = "en",
): Promise<string> {
  if (!text.trim()) return text;

  const params = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
    q: text,
  });

  try {
    const url = useFallback
      ? `/api/translate?${params}`
      : `${GT_URL}?${params}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`GT ${res.status}`);

    const data = await res.json();
    const translated = (data[0] as [string, string][])
      .map((seg) => seg[0])
      .join("");

    return translated.trim() || text;
  } catch (e) {
    // If direct GT fails (CORS), switch to proxy for all subsequent calls
    if (!useFallback) {
      useFallback = true;
      return translateText(text, source, target);
    }
    return text;
  }
}

export async function translateBatch(
  texts: string[],
  source = "zh",
  target = "en",
): Promise<string[]> {
  if (!texts.length) return [];

  // Join with newlines, translate as one, split back
  const joined = texts.map((t) => t.replace(/\n/g, " ").trim()).join("\n");

  const params = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
  });

  try {
    const url = useFallback ? "/api/translate" : GT_URL;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...Object.fromEntries(params), q: joined }),
    });
    if (!res.ok) throw new Error(`GT ${res.status}`);

    const data = await res.json();
    const full = (data[0] as [string, string][])
      .map((seg) => seg[0])
      .join("");

    const parts = full.split("\n");
    return texts.map((_, i) => (i < parts.length ? parts[i].trim() : texts[i]));
  } catch (e) {
    if (!useFallback) {
      useFallback = true;
      return translateBatch(texts, source, target);
    }
    return texts;
  }
}
