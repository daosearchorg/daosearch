"use client";

import { useState, useEffect } from "react";
import { Globe, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  title: string;
  title_en: string;
  url: string;
  snippet: string;
  snippet_en: string;
  domain: string;
}

interface BookSourcePickerProps {
  bookId: number;
  bookTitleRaw: string;
  bookUrl?: string;
  onSelect: (sourceUrl: string, domain: string) => void;
}

export function BookSourcePicker({
  bookId,
  bookTitleRaw,
  bookUrl,
  onSelect,
}: BookSourcePickerProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Searching the web...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setLoadingStatus("Searching the web...");

    (async () => {
      try {
        const res = await fetch(
          `/api/reader/search?q=${encodeURIComponent(bookTitleRaw)}&stream=1`
        );
        if (!res.ok) throw new Error("Search failed");

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let searchResults: SearchResult[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const block of events) {
            if (!block.trim()) continue;
            const lines = block.split("\n");
            let eventType = "";
            let dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                dataLines.push(line.slice(6));
              }
            }
            if (!eventType || !dataLines.length) continue;
            const data = dataLines.join("\n");

            if (eventType === "status") {
              if (!cancelled) setLoadingStatus(data);
            } else if (eventType === "error") {
              if (!cancelled) {
                setError(data);
                setLoading(false);
              }
              return;
            } else if (eventType === "results") {
              searchResults = JSON.parse(data);
            }
          }
        }

        if (!cancelled) {
          setResults(searchResults);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Could not fetch sources. Is the reader service running?");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [bookTitleRaw]);

  // Build full list: book.qq.com first, then external results (deduped)
  const allSources: SearchResult[] = [];
  if (bookUrl) {
    allSources.push({
      title: "Qidian",
      title_en: "Qidian — Original Source",
      url: bookUrl,
      snippet: "",
      snippet_en: "Free chapters available. VIP chapters may be truncated.",
      domain: "book.qq.com",
    });
  }
  for (const r of results) {
    if (r.domain !== "book.qq.com") {
      allSources.push(r);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {loading && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{loadingStatus}</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <AlertCircle className="size-3.5" />
          {error}
        </div>
      )}

      {!loading && allSources.length === 0 && !error && (
        <p className="text-sm text-muted-foreground py-4">No sources found for this book.</p>
      )}

      {!loading && allSources.length > 0 && (
        <div className="flex flex-col gap-2">
          <GroupedSources sources={allSources} onSelect={onSelect} />
          <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 mt-1">
            <Globe className="size-3 shrink-0" />
            Fetched live from the web — nothing is stored by DaoSearch.
          </p>
        </div>
      )}
    </div>
  );
}

function GroupedSources({
  sources,
  onSelect,
}: {
  sources: SearchResult[];
  onSelect: (url: string, domain: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Group by domain, preserving order (first result per domain determines position)
  const groups: { domain: string; items: SearchResult[] }[] = [];
  const domainMap = new Map<string, SearchResult[]>();
  for (const s of sources) {
    if (!domainMap.has(s.domain)) {
      domainMap.set(s.domain, []);
      groups.push({ domain: s.domain, items: domainMap.get(s.domain)! });
    }
    domainMap.get(s.domain)!.push(s);
  }

  return (
    <>
      {groups.map(({ domain, items }) => {
        const first = items[0];
        const rest = items.slice(1);
        const isExpanded = expanded[domain] || false;

        return (
          <div key={domain} className="flex flex-col gap-1">
            <SourceCard result={first} onSelect={onSelect} />
            {rest.length > 0 && !isExpanded && (
              <button
                onClick={() => setExpanded((e) => ({ ...e, [domain]: true }))}
                className="flex items-center justify-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className="size-3" />
                {rest.length} more from {domain}
              </button>
            )}
            {isExpanded && rest.map((r) => (
              <SourceCard key={r.url} result={r} onSelect={onSelect} />
            ))}
            {isExpanded && rest.length > 0 && (
              <button
                onClick={() => setExpanded((e) => ({ ...e, [domain]: false }))}
                className="flex items-center justify-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function SourceCard({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: (url: string, domain: string) => void;
}) {
  const hasTitle = result.title || result.title_en;
  const displayTitle = result.title_en || result.title;
  const displaySnippet = result.snippet_en || result.snippet;

  let urlPath = "";
  try { urlPath = new URL(result.url).pathname; } catch { urlPath = result.url; }

  return (
    <button
      onClick={() => onSelect(result.url, result.domain)}
      className="flex flex-col gap-1.5 p-3 rounded-lg border border-border/60 hover:bg-muted/50 text-left transition-colors"
    >
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">{result.domain}</Badge>
        <span className="text-[11px] text-muted-foreground/40 truncate">{urlPath}</span>
        {result.domain === "book.qq.com" && (
          <span className="text-xs text-muted-foreground ml-auto">Original</span>
        )}
      </div>
      {hasTitle && (
        <p className="text-sm leading-tight">{displayTitle}</p>
      )}
      {displaySnippet && (
        <p className="text-xs text-muted-foreground line-clamp-2">{displaySnippet}</p>
      )}
    </button>
  );
}
