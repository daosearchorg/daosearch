const READER_URL = process.env.READER_SERVICE_URL || "http://localhost:8000";

export interface ReaderSearchResult {
  title: string;
  title_en: string;
  url: string;
  snippet: string;
  snippet_en: string;
  domain: string;
}

export interface ReaderNovelData {
  title: string;
  author: string;
  status: string;
  description: string;
  novel_url: string;
  image_url: string;
}

export interface ReaderChapterEntry {
  title: string;
  url: string;
  sequence: number;
}

export interface ReaderChapterContent {
  title: string;
  content: string;
  chapter_url: string;
  vip: boolean;
}

async function readerFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, READER_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Reader service error ${res.status}: ${text}`);
  }
  return res.json();
}

export function searchSources(query: string) {
  return readerFetch<ReaderSearchResult[]>("/search", { q: query });
}

export function getNovelData(url: string) {
  return readerFetch<ReaderNovelData>("/novel", { url });
}

export function getSourceChapters(url: string) {
  return readerFetch<ReaderChapterEntry[]>("/chapters", { url });
}

export function getChapterContent(url: string) {
  return readerFetch<ReaderChapterContent>("/chapter", { url });
}
