"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Search,
  ExternalLink,
  BookOpen,
  Clock,
  ArrowLeft,
  ChevronRight,
  Pencil,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bookUrl } from "@/lib/utils";
import { DaoReaderExtension } from "@/components/dao-reader/extension";

interface QidianChapter {
  id: number;
  sequenceNumber: number;
  title: string | null;
  titleTranslated: string | null;
  url: string | null;
}

interface CachedChapter {
  seq: number;
  title: string | null;
  translatedAt: Date;
}

interface DaoReaderLandingProps {
  bookId: number;
  bookTitle: string;
  bookTitleRaw: string;
  bookImageUrl: string | null;
  savedSourceUrl: string | null;
  savedSeq: number | null;
  savedDomain: string | null;
  cachedChapters: CachedChapter[];
  isQidian: boolean;
  qidianChapters: QidianChapter[] | null;
  qidianTotalPages: number;
  isAuthenticated: boolean;
  isExtension?: boolean;
  extensionUrl?: string | null;
}

interface PopularDomain {
  domain: string;
  readers: number;
}

export function DaoReaderLanding({
  bookId,
  bookTitle,
  bookTitleRaw,
  bookImageUrl,
  savedSourceUrl,
  savedSeq,
  savedDomain,
  cachedChapters,
  isQidian,
  qidianChapters,
  qidianTotalPages,
  isAuthenticated,
  isExtension,
  extensionUrl,
}: DaoReaderLandingProps) {
  const router = useRouter();
  const [pasteUrl, setPasteUrl] = useState("");
  const [popularDomains, setPopularDomains] = useState<PopularDomain[]>([]);
  const [editingProgress, setEditingProgress] = useState(false);
  const [manualSeq, setManualSeq] = useState(String(savedSeq ?? ""));
  const [chaptersPage, setChaptersPage] = useState(1);
  const [allQidianChapters, setAllQidianChapters] = useState(qidianChapters ?? []);

  // Fetch popular domains
  useEffect(() => {
    fetch(`/api/reader/popular-domains?bookId=${bookId}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPopularDomains(data); })
      .catch(() => {});
  }, [bookId]);

  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(bookTitleRaw + " 阅读")}`;

  const handleManualProgress = async () => {
    const seq = Number(manualSeq);
    if (!seq || isNaN(seq) || seq < 1) return;
    await fetch(`/api/books/${bookId}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterSeq: seq }),
    });
    setEditingProgress(false);
    router.refresh();
  };

  const loadMoreChapters = async () => {
    const nextPage = chaptersPage + 1;
    const res = await fetch(`/api/books/${bookId}/chapters?page=${nextPage}`);
    if (res.ok) {
      const data = await res.json();
      if (data.items) {
        setAllQidianChapters((prev) => [...prev, ...data.items]);
        setChaptersPage(nextPage);
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={bookUrl(bookId, bookTitle)} className="shrink-0">
          <Button variant="ghost" size="icon" className="size-9">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          {bookImageUrl && (
            <Image
              src={bookImageUrl}
              alt={bookTitle}
              width={40}
              height={53}
              className="rounded shrink-0 object-cover w-10 h-[53px]"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-medium truncate">{bookTitle}</h1>
            <p className="text-sm text-muted-foreground truncate">{bookTitleRaw}</p>
          </div>
        </div>
      </div>

      {/* Extension content */}
      {isExtension && extensionUrl && (
        <DaoReaderExtension
          sourceUrl={extensionUrl}
          isAuthenticated={isAuthenticated}
        />
      )}

      {/* Continue reading */}
      {savedSeq != null && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <BookOpen className="size-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Continue reading</p>
                <p className="text-xs text-muted-foreground truncate">
                  Chapter {savedSeq}
                  {savedDomain ? ` on ${savedDomain}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setEditingProgress(true)}
              >
                <Pencil className="size-3.5" />
              </Button>
              {savedSourceUrl && (
                <a href={savedSourceUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm">
                    <ExternalLink className="size-3.5" />
                    Open
                  </Button>
                </a>
              )}
            </div>
          </div>
          {editingProgress && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <Input
                type="number"
                value={manualSeq}
                onChange={(e) => setManualSeq(e.target.value)}
                placeholder="Chapter number"
                className="h-8 w-32"
                min={1}
                onKeyDown={(e) => e.key === "Enter" && handleManualProgress()}
              />
              <Button size="sm" variant="outline" className="h-8" onClick={handleManualProgress}>
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingProgress(false)}>
                Cancel
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Search for chapters */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Find chapters to read</h2>
        <a
          href={googleSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors"
        >
          <Search className="size-5 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Search Google</p>
            <p className="text-xs text-muted-foreground truncate">{bookTitleRaw} 阅读</p>
          </div>
          <ExternalLink className="size-4 text-muted-foreground shrink-0" />
        </a>

        {/* Popular domains */}
        {popularDomains.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            <span className="text-xs text-muted-foreground/70">Popular among readers:</span>
            {popularDomains.map((d) => (
              <Badge key={d.domain} variant="secondary" className="text-xs font-normal">
                {d.domain}
                <span className="text-muted-foreground ml-1">({d.readers})</span>
              </Badge>
            ))}
          </div>
        )}

        {/* Paste URL */}
        <div className="flex items-center gap-2">
          <Input
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            placeholder="Paste a chapter URL..."
            className="h-9 flex-1"
          />
          <Button
            size="sm"
            className="h-9"
            disabled={!pasteUrl.trim()}
            onClick={() => {
              // Future: extension integration point
              // For now, open the URL externally
              if (pasteUrl.trim()) window.open(pasteUrl.trim(), "_blank");
            }}
          >
            Open
          </Button>
        </div>
        <p className="text-xs text-muted-foreground/60 px-1">
          Install the DaoSearch browser extension to translate pages directly
        </p>
      </div>

      {/* Qidian chapters */}
      {isQidian && allQidianChapters.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ScrollText className="size-4" />
            Chapters ({allQidianChapters.length}{qidianTotalPages > 1 ? "+" : ""})
          </h2>
          <div className="flex flex-col rounded-lg border divide-y">
            {allQidianChapters.map((ch) => (
              <button
                key={ch.id}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors ${
                  savedSeq === ch.sequenceNumber ? "bg-accent/30" : ""
                }`}
                onClick={() => {
                  // Navigate to old reader for Qidian chapters (still works)
                  if (ch.url) {
                    router.push(`/book/${bookId}/read?seq=${ch.sequenceNumber}&source=${encodeURIComponent(ch.url)}`);
                  }
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    <span className="text-muted-foreground tabular-nums">{ch.sequenceNumber}.</span>{" "}
                    {ch.titleTranslated || ch.title || `Chapter ${ch.sequenceNumber}`}
                  </p>
                </div>
                {savedSeq === ch.sequenceNumber && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">Current</Badge>
                )}
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
          {chaptersPage < qidianTotalPages && (
            <Button variant="outline" size="sm" onClick={loadMoreChapters} className="mx-auto">
              Load more chapters
            </Button>
          )}
        </div>
      )}

      {/* Cached translations */}
      {cachedChapters.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="size-4" />
            Your translated chapters ({cachedChapters.length})
          </h2>
          <div className="flex flex-col rounded-lg border divide-y">
            {cachedChapters.map((ch) => (
              <button
                key={ch.seq}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
                onClick={() => {
                  // Future: open cached chapter in reading mode
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="text-muted-foreground tabular-nums">{ch.seq}.</span>{" "}
                    {ch.title || `Chapter ${ch.seq}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(ch.translatedAt).toLocaleDateString()}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Not authenticated notice */}
      {!isAuthenticated && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Sign in to track your reading progress and save translations.
        </p>
      )}
    </div>
  );
}
