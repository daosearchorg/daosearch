"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bookUrl, cn } from "@/lib/utils";

interface SearchResult {
  id: number;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  imageUrl: string | null;
}

function SearchDropdown({
  loading,
  results,
  query,
  onSelect,
  onAdvanced,
}: {
  loading: boolean;
  results: SearchResult[];
  query: string;
  onSelect: (r: SearchResult) => void;
  onAdvanced: () => void;
}) {
  return (
    <div className="rounded-lg border bg-popover shadow-lg overflow-hidden">
      {loading && results.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">Searching...</div>
      )}
      {!loading && results.length === 0 && query.trim().length >= 2 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">No results found</div>
      )}
      {results.length > 0 && (
        <div className="py-1">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
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
                <p className="text-sm truncate">{r.titleTranslated || r.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{r.authorTranslated || r.author}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={onAdvanced}
        className="flex items-center justify-center gap-1.5 w-full border-t px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        Advanced search
        <ArrowRight className="size-3" />
      </button>
    </div>
  );
}

export function NavSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
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
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Close search on scroll
  useEffect(() => {
    if (!open && !mobileExpanded) return;
    const onScroll = () => {
      setOpen(false);
      if (mobileExpanded) {
        setMobileExpanded(false);
        setQuery("");
      }
      inputRef.current?.blur();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open, mobileExpanded]);

  // Close on click outside (desktop only — mobile overlay has its own X button)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mobileExpanded) return;
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileExpanded]);

  const goToLibrary = () => {
    if (query.trim()) {
      router.push(`/library?name=${encodeURIComponent(query.trim())}&page=1`);
    } else {
      router.push("/library");
    }
    setOpen(false);
    setQuery("");
    setMobileExpanded(false);
  };

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    setMobileExpanded(false);
    router.push(bookUrl(result.id, result.titleTranslated));
  };

  const showDropdown = open && (query.trim().length >= 2);

  return (
    <>
      {/* Desktop: always-visible input with dropdown */}
      <div ref={containerRef} className="relative hidden sm:block">
        <div className="flex items-center relative">
          <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search novels..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === "Enter") goToLibrary(); if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); } }}
            className="h-8 w-64 pl-8 pr-2 placeholder:text-muted-foreground/60 transition-all focus:w-80"
          />
        </div>
        {showDropdown && (
          <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 w-[22rem] z-50">
            <SearchDropdown loading={loading} results={results} query={query} onSelect={handleSelect} onAdvanced={goToLibrary} />
          </div>
        )}
      </div>

      {/* Mobile: icon toggle */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("size-9 sm:hidden", mobileExpanded && "invisible")}
        onClick={() => { setMobileExpanded(true); setOpen(true); }}
      >
        <Search className="size-[18px]" />
      </Button>

      {/* Mobile: full-width overlay */}
      <div
        ref={mobileRef}
        className={cn(
          "sm:hidden fixed inset-x-0 top-0 z-[60] bg-background overflow-hidden transition-all duration-300 ease-in-out",
          mobileExpanded
            ? "opacity-100 max-h-screen"
            : "opacity-0 max-h-0 pointer-events-none",
        )}
      >
        <div className="flex items-center h-14 px-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            {mobileExpanded && (
              <MobileSearchInput
                query={query}
                setQuery={setQuery}
                setOpen={setOpen}
                onEnter={goToLibrary}
                onEscape={() => { setMobileExpanded(false); setOpen(false); }}
              />
            )}
            <button
              onClick={() => { setMobileExpanded(false); setOpen(false); setQuery(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        {showDropdown && mobileExpanded && (
          <div className="px-4 pb-4">
            <SearchDropdown loading={loading} results={results} query={query} onSelect={handleSelect} onAdvanced={goToLibrary} />
          </div>
        )}
      </div>
    </>
  );
}

function MobileSearchInput({
  query,
  setQuery,
  setOpen,
  onEnter,
  onEscape,
}: {
  query: string;
  setQuery: (q: string) => void;
  setOpen: (o: boolean) => void;
  onEnter: () => void;
  onEscape: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <Input
      ref={inputRef}
      type="text"
      placeholder="Search novels..."
      value={query}
      onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      onKeyDown={(e) => { if (e.key === "Enter") onEnter(); if (e.key === "Escape") onEscape(); }}
      className="h-10 w-full pl-10 pr-10 text-base placeholder:text-muted-foreground/60"
    />
  );
}
