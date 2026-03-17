"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Entity {
  id: number | null;
  sourceTerm: string;
  translatedTerm: string;
  gender: string;
  category: string;
}

interface EntityEditorProps {
  bookId: number;
  isAuthenticated: boolean;
}

export function EntityEditor({ bookId, isAuthenticated }: EntityEditorProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [newSource, setNewSource] = useState("");
  const [newTranslated, setNewTranslated] = useState("");
  const [adding, setAdding] = useState(false);

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

  const handleUpdate = async (entity: Entity, field: string, value: string) => {
    if (!entity.id || !isAuthenticated) return;

    const updated = { ...entity, [field]: value };
    setEntities((prev) =>
      prev.map((e) => (e.id === entity.id ? updated : e)),
    );

    setSaving(entity.id);
    try {
      await fetch("/api/reader/entities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entity.id,
          translatedTerm: field === "translatedTerm" ? value : entity.translatedTerm,
          gender: field === "gender" ? value : entity.gender,
          category: field === "category" ? value : entity.category,
        }),
      });
    } catch {
      // revert on failure
      loadEntities();
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: number | null) => {
    if (!id || !isAuthenticated) return;
    setEntities((prev) => prev.filter((e) => e.id !== id));
    try {
      await fetch(`/api/reader/entities?id=${id}`, { method: "DELETE" });
    } catch {
      loadEntities();
    }
  };

  const handleAdd = async () => {
    if (!newSource.trim() || !newTranslated.trim() || !isAuthenticated) return;
    setAdding(true);
    try {
      const res = await fetch("/api/reader/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          entities: [
            {
              sourceTerm: newSource.trim(),
              translatedTerm: newTranslated.trim(),
              gender: "N",
              category: "character",
            },
          ],
        }),
      });
      if (res.ok) {
        setNewSource("");
        setNewTranslated("");
        await loadEntities();
      }
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Entity Glossary
          <span className="text-muted-foreground font-normal ml-1.5">
            ({entities.length})
          </span>
        </h3>
      </div>

      {entities.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No entities yet. They will be detected during AI translation.
        </p>
      )}

      {/* Entity list */}
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {entities.map((entity) => (
          <div
            key={entity.id ?? entity.sourceTerm}
            className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group"
          >
            {/* Source term (Chinese) */}
            <span className="text-sm text-muted-foreground shrink-0 min-w-[60px] truncate">
              {entity.sourceTerm}
            </span>

            {/* Translated term (editable) */}
            {isAuthenticated && entity.id ? (
              <Input
                value={entity.translatedTerm}
                onChange={(e) =>
                  setEntities((prev) =>
                    prev.map((ent) =>
                      ent.id === entity.id
                        ? { ...ent, translatedTerm: e.target.value }
                        : ent,
                    ),
                  )
                }
                onBlur={(e) =>
                  handleUpdate(entity, "translatedTerm", e.target.value)
                }
                className="h-7 text-sm flex-1 min-w-0"
              />
            ) : (
              <span className="text-sm flex-1 min-w-0 truncate">
                {entity.translatedTerm}
              </span>
            )}

            {/* Gender dropdown */}
            {isAuthenticated && entity.id ? (
              <Select
                value={entity.gender || "N"}
                onValueChange={(v) => handleUpdate(entity, "gender", v)}
              >
                <SelectTrigger className="h-7 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">M</SelectItem>
                  <SelectItem value="F">F</SelectItem>
                  <SelectItem value="N">N</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-muted-foreground w-6 text-center">
                {entity.gender || "N"}
              </span>
            )}

            {/* Category badge */}
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {entity.category || "character"}
            </Badge>

            {/* Delete */}
            {isAuthenticated && entity.id && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => handleDelete(entity.id)}
              >
                <Trash2 className="size-3 text-muted-foreground" />
              </Button>
            )}

            {/* Saving indicator */}
            {saving === entity.id && (
              <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Add new entity */}
      {isAuthenticated && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <Input
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            placeholder="Chinese term"
            className="h-7 text-sm flex-1"
          />
          <Input
            value={newTranslated}
            onChange={(e) => setNewTranslated(e.target.value)}
            placeholder="English translation"
            className="h-7 text-sm flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <Button
            variant="outline"
            size="icon"
            className="size-7 shrink-0"
            onClick={handleAdd}
            disabled={adding || !newSource.trim() || !newTranslated.trim()}
          >
            {adding ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Plus className="size-3" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
