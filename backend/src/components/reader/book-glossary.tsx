"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/utils";
import { EntityDialog, type EntityData } from "@/components/reader/entity-dialog";

const PAGE_SIZE = 100;

interface BookEntity {
  id: number | null;
  sourceTerm: string;
  translatedTerm: string;
  gender: string;
  chapterCount?: number; // how many chapters this entity appears in
}

interface BookGlossaryProps {
  bookId: number;
  bookTitle: string;
  isAuthenticated: boolean;
}

function genderLabel(g: string) {
  if (g === "M") return "Male";
  if (g === "F") return "Female";
  return "Neutral";
}

export function BookGlossary({ bookId, bookTitle, isAuthenticated }: BookGlossaryProps) {
  const [entities, setEntities] = useState<BookEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingEntity, setEditingEntity] = useState<EntityData | null>(null);
  const [totalChapters, setTotalChapters] = useState(0);

  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reader/entities?bookId=${bookId}&withCounts=1`);
      if (res.ok) {
        const data = await res.json();
        const entities: BookEntity[] = (data.entities || []).map((e: BookEntity) => ({
          ...e,
          chapterCount: data.occurrenceCounts?.[e.sourceTerm] ?? 0,
        }));
        // Sort by chapter count descending (most influential first)
        entities.sort((a, b) => (b.chapterCount ?? 0) - (a.chapterCount ?? 0));
        setEntities(entities);
        setTotalChapters(data.chapterCount ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  const filtered = search.trim()
    ? entities.filter(
        (e) =>
          e.sourceTerm.toLowerCase().includes(search.toLowerCase()) ||
          e.translatedTerm.toLowerCase().includes(search.toLowerCase()),
      )
    : entities;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE;
  const displayed = filtered.slice(start, start + PAGE_SIZE);

  const readerUrl = `/reader/${bookId}/${slugify(bookTitle)}`;

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0 size-8" asChild>
          <Link href={readerUrl}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground truncate">{bookTitle}</p>
          <h1 className="text-lg font-medium">Glossary</h1>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entities..."
          className="h-10 pl-9 text-sm"
        />
      </div>

      {/* Entity count */}
      {!loading && entities.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length === entities.length
            ? `${entities.length} entities`
            : `${filtered.length} of ${entities.length} entities`}
          {totalChapters > 0 && ` · ${totalChapters} translated chapters`}
        </p>
      )}

      {/* Entity table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          {entities.length === 0
            ? "No entities yet. They will be detected during AI translation."
            : "No matches found."}
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[30%]">Original</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2">Translation</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 w-16">Gender</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2 w-12">Ch.</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map((entity) => (
                <tr
                  key={entity.id ?? entity.sourceTerm}
                  className="hover:bg-accent/40 transition-colors cursor-pointer"
                  onClick={() => {
                    if (!isAuthenticated || !entity.id) return;
                    setEditingEntity({
                      id: entity.id,
                      original: entity.sourceTerm,
                      translated: entity.translatedTerm,
                      gender: entity.gender || "N",
                    });
                  }}
                >
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-0">{entity.sourceTerm}</td>
                  <td className="px-3 py-2 truncate max-w-0">{entity.translatedTerm}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{genderLabel(entity.gender)}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums text-right">{entity.chapterCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground px-2">
            <span className="font-medium text-foreground">{page}</span>
            {" / "}
            {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Entity edit dialog */}
      {editingEntity && (
        <EntityDialog
          open={!!editingEntity}
          onOpenChange={(open) => {
            if (!open) setEditingEntity(null);
          }}
          entity={editingEntity}
          bookId={bookId}
          onSaved={loadEntities}
        />
      )}
    </div>
  );
}
