"use client";

import { useState, useEffect } from "react";
import { Globe, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/reader/search?q=${encodeURIComponent(bookTitleRaw)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Search failed");
        return r.json();
      })
      .then((data: SearchResult[]) => {
        if (cancelled) return;
        setResults(data);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not fetch sources. Is the reader service running?");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

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
          <p className="text-sm text-muted-foreground">Searching for sources...</p>
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
          {allSources.map((source) => (
            <SourceCard key={source.url} result={source} onSelect={onSelect} />
          ))}
          <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 mt-1">
            <Globe className="size-3 shrink-0" />
            Fetched live from the web — nothing is stored by DaoSearch.
          </p>
        </div>
      )}
    </div>
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

  return (
    <button
      onClick={() => onSelect(result.url, result.domain)}
      className="flex flex-col gap-1.5 p-3 rounded-lg border border-border/60 hover:bg-muted/50 text-left transition-colors"
    >
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">{result.domain}</Badge>
        {result.domain === "book.qq.com" && (
          <span className="text-xs text-muted-foreground">Original</span>
        )}
      </div>
      {hasTitle && (
        <p className="text-sm leading-tight">{displayTitle}</p>
      )}
      {displaySnippet && (
        <p className="text-xs text-muted-foreground line-clamp-2">{displaySnippet}</p>
      )}
      <p className="text-[11px] text-muted-foreground/50 truncate">{result.url}</p>
    </button>
  );
}
