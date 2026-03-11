"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { bookUrl } from "@/lib/utils";

interface SearchResult {
  id: number;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  imageUrl: string | null;
}

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length >= 2) {
      setLoading(true);
      setResults([]);
    } else {
      setResults([]);
      setLoading(false);
    }
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const goToLibrary = () => {
    if (query.trim()) {
      router.push(`/library?name=${encodeURIComponent(query.trim())}&page=1`);
    } else {
      router.push("/library");
    }
    setOpen(false);
    setQuery("");
  };

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    router.push(bookUrl(result.id, result.titleTranslated));
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-lg mx-auto">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search books by title..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goToLibrary();
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          className="h-11 sm:h-12 w-full pl-11 pr-4 rounded-xl text-base placeholder:text-muted-foreground/60"
        />
      </div>
      {showDropdown && (
        <div className="absolute top-full mt-2 inset-x-0 z-50 rounded-xl border bg-popover shadow-lg overflow-hidden">
          {loading && results.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Searching...
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No results found
            </div>
          )}
          {results.length > 0 && (
            <div className="py-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-accent transition-colors"
                >
                  {r.imageUrl ? (
                    <Image
                      src={r.imageUrl}
                      alt=""
                      width={28}
                      height={37}
                      className="shrink-0 rounded object-cover w-7 h-[37px]"
                    />
                  ) : (
                    <div className="shrink-0 w-7 h-[37px] rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">
                      {r.titleTranslated || r.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.authorTranslated || r.author}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={goToLibrary}
            className="flex items-center justify-center gap-1.5 w-full border-t px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Advanced search in Library
            <ArrowRight className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
