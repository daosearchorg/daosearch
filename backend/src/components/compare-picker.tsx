"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X, Star, Users, Shuffle, ArrowRightLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SearchResult {
  id: number;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  imageUrl: string | null;
  genreName: string | null;
}

interface PopularBook {
  id: number;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  imageUrl: string | null;
  genreName: string | null;
  readerCount: number | null;
  qqScore: string | null;
  wordCount: number | null;
}

function BookSlot({ book, onRemove }: { book: SearchResult; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 min-w-0">
      {book.imageUrl ? (
        <Image src={book.imageUrl} alt="" width={40} height={53} className="shrink-0 rounded object-cover w-10 h-[53px]" />
      ) : (
        <div className="shrink-0 w-10 h-[53px] rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="text-sm font-medium truncate">{book.titleTranslated || book.title}</p>
        <p className="text-xs text-muted-foreground truncate">{book.authorTranslated || book.author}</p>
      </div>
      <button onClick={onRemove} className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
        <X className="size-4" />
      </button>
    </div>
  );
}

function SearchSlot({
  label,
  onSelect,
  selected,
}: {
  label: string;
  onSelect: (r: SearchResult) => void;
  selected: SearchResult[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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
      setResults(data.filter((r: SearchResult) => !selected.some((s) => s.id === r.id)));
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [selected]);

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (r: SearchResult) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onSelect(r);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-xs text-muted-foreground mb-2">{label}</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search for a book..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            className="pl-10"
          />
        </div>
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute top-full mt-1.5 left-0 right-0 z-50 rounded-lg border bg-popover shadow-lg overflow-hidden">
          {loading && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">Searching...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">No results found</div>
          )}
          {!loading && results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-accent transition-colors"
            >
              {r.imageUrl ? (
                <Image src={r.imageUrl} alt="" width={28} height={37} className="shrink-0 rounded object-cover w-7 h-[37px]" />
              ) : (
                <div className="shrink-0 w-7 h-[37px] rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{r.titleTranslated || r.title}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground truncate">{r.authorTranslated || r.author}</span>
                  {r.genreName && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{r.genreName}</Badge>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCount(n: number | null): string {
  if (n == null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}

function qqScoreColor(score: string): string {
  const n = parseFloat(score);
  if (n === 0) return "";
  if (n >= 8) return "text-green-600 dark:text-green-500";
  if (n >= 5) return "text-amber-500";
  return "text-red-500";
}

function QuickPickGrid({ books, selected, onSelect }: { books: PopularBook[]; selected: SearchResult[]; onSelect: (r: SearchResult) => void }) {
  if (books.length === 0) return null;

  const available = books.filter((b) => !selected.some((s) => s.id === b.id));

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
        {selected.length === 0 ? "Popular books — tap any two to compare" : "Pick one more to compare"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {available.map((book) => (
          <button
            key={book.id}
            onClick={() => onSelect(book)}
            className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
          >
            {book.imageUrl ? (
              <Image src={book.imageUrl} alt="" width={40} height={53} className="shrink-0 rounded object-cover w-10 h-[53px]" />
            ) : (
              <div className="shrink-0 w-10 h-[53px] rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight line-clamp-1">{book.titleTranslated || book.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{book.authorTranslated || book.author}</p>
              <div className="flex items-center gap-2 mt-1">
                {book.genreName && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{book.genreName}</Badge>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {book.qqScore && (
                <span className={`inline-flex items-center gap-0.5 text-[11px] ${qqScoreColor(book.qqScore) || "text-muted-foreground"}`}>
                  <Star className="size-3" />
                  <span className="font-medium tabular-nums">{book.qqScore}</span>
                </span>
              )}
              {book.readerCount != null && book.readerCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <Users className="size-3" />
                  <span className="font-medium tabular-nums">{formatCount(book.readerCount)}</span>
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ComparePicker({ bookIds, popularBooks }: { bookIds: number[]; popularBooks: PopularBook[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<SearchResult[]>([]);

  // Load pre-selected books from IDs
  useEffect(() => {
    if (bookIds.length === 0) return;
    Promise.all(
      bookIds.map((id) =>
        fetch(`/api/books/search?q=${id}`).then((r) => r.json()),
      ),
    ).then((results) => {
      const found = results.flat().filter((r: SearchResult) => bookIds.includes(r.id));
      setSelected(found);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (result: SearchResult) => {
    const next = [...selected, result];
    setSelected(next);
    if (next.length >= 2) {
      router.push(`/compare?books=${next[0].id},${next[1].id}`);
    }
  };

  const handleRemove = (id: number) => {
    setSelected(selected.filter((s) => s.id !== id));
  };

  const handleRandom = () => {
    const pool = popularBooks.filter((b) => !selected.some((s) => s.id === b.id));
    if (pool.length < 2 && selected.length === 0) return;
    if (selected.length === 0) {
      // Pick two random books
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      router.push(`/compare?books=${shuffled[0].id},${shuffled[1].id}`);
    } else {
      // Pick one more random book
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      if (shuffled.length > 0) {
        router.push(`/compare?books=${selected[0].id},${shuffled[0].id}`);
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={handleRandom} className="shrink-0">
          <Shuffle className="size-3.5" />
          Random
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-start">
        {/* Slot 1 */}
        <div>
          {selected[0] ? (
            <BookSlot book={selected[0]} onRemove={() => handleRemove(selected[0].id)} />
          ) : (
            <SearchSlot label="Book A" onSelect={handleSelect} selected={selected} />
          )}
        </div>

        {/* VS divider */}
        <div className="hidden sm:flex items-center justify-center self-center">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
            <ArrowRightLeft className="size-4 text-muted-foreground" />
          </div>
        </div>

        {/* Slot 2 */}
        <div>
          {selected[1] ? (
            <BookSlot book={selected[1]} onRemove={() => handleRemove(selected[1].id)} />
          ) : selected[0] ? (
            <SearchSlot label="Book B" onSelect={handleSelect} selected={selected} />
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed p-[26px] text-sm text-muted-foreground">
              Book B
            </div>
          )}
        </div>
      </div>

      {selected.length < 2 && <QuickPickGrid books={popularBooks} selected={selected} onSelect={handleSelect} />}
    </div>
  );
}
