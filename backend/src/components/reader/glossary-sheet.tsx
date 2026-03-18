"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { EntityDialog, type EntityData } from "@/components/reader/entity-dialog";

// ─── Types ───────────────────────────────────────────────────

interface BookEntity {
  id: number | null;
  sourceTerm: string;
  translatedTerm: string;
  gender: string;
}

interface GlossarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: number;
  isAuthenticated: boolean;
}

// ─── Entity List ─────────────────────────────────────────────

function EntityList({
  bookId,
  isAuthenticated,
}: {
  bookId: number;
  isAuthenticated: boolean;
}) {
  const [entities, setEntities] = useState<BookEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingEntity, setEditingEntity] = useState<EntityData | null>(null);

  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reader/entities?bookId=${bookId}`);
      if (res.ok) {
        const data = await res.json();
        setEntities(data.entities || []);
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

  const filtered = search.trim()
    ? entities.filter(
        (e) =>
          e.sourceTerm.toLowerCase().includes(search.toLowerCase()) ||
          e.translatedTerm.toLowerCase().includes(search.toLowerCase()),
      )
    : entities;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entities..."
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {entities.length === 0
              ? "No entities yet. They will be detected during AI translation."
              : "No matches found."}
          </p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((entity) => (
              <button
                key={entity.id ?? entity.sourceTerm}
                type="button"
                className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md hover:bg-muted/50 text-left transition-colors"
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
                <span className="text-sm text-muted-foreground shrink-0 min-w-[60px] truncate">
                  {entity.sourceTerm}
                </span>
                <span className="text-sm flex-1 min-w-0 truncate">
                  {entity.translatedTerm}
                </span>
                {entity.gender && entity.gender !== "N" && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {entity.gender === "M" ? "M" : "F"}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

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
    </>
  );
}

// ─── Responsive Sheet ────────────────────────────────────────

export function GlossarySheet({
  open,
  onOpenChange,
  bookId,
  isAuthenticated,
}: GlossarySheetProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Book Glossary</DrawerTitle>
            <DrawerDescription>
              Entity translations for this book.
            </DrawerDescription>
          </DrawerHeader>
          <EntityList bookId={bookId} isAuthenticated={isAuthenticated} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Book Glossary</SheetTitle>
          <SheetDescription>
            Entity translations for this book.
          </SheetDescription>
        </SheetHeader>
        <EntityList bookId={bookId} isAuthenticated={isAuthenticated} />
      </SheetContent>
    </Sheet>
  );
}
