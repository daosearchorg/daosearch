"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Globe, Lock, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookSortSelect } from "@/components/book/sort-select";
import { BooklistTags } from "@/components/book/tags";
import { communityBooklistUrl } from "@/lib/utils";
import type { BookSort } from "@/lib/types";

interface TagData {
  id: number;
  name: string;
  displayName: string;
  count: number;
  userVoted: boolean;
}

interface ListDetailHeaderProps {
  list: {
    id: number;
    name: string;
    description: string | null;
    isPublic: number;
    followerCount: number;
  };
  total: number;
  sort: BookSort;
  listTags?: TagData[];
}

export function ListDetailHeader({ list, total, sort, listTags = [] }: ListDetailHeaderProps) {
  const [isPublic, setIsPublic] = useState(list.isPublic);
  const [followerCount] = useState(list.followerCount);
  const [description, setDescription] = useState(list.description);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(list.description ?? "");

  const handleTogglePublic = async () => {
    const newIsPublic = isPublic === 1 ? 0 : 1;
    setIsPublic(newIsPublic);
    try {
      await fetch(`/api/lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: newIsPublic }),
      });
    } catch {}
  };

  const handleDescriptionSave = async () => {
    const desc = descValue.trim() || null;
    setDescription(desc);
    setEditingDesc(false);
    try {
      await fetch(`/api/lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc }),
      });
    } catch {}
  };

  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          {/* Title + visibility */}
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-normal tracking-tight truncate">{list.name}</h1>
            <button
              onClick={handleTogglePublic}
              className="shrink-0 p-1 rounded-md hover:bg-accent transition-colors"
              title={isPublic === 1 ? "Make private" : "Make public"}
            >
              {isPublic === 1 ? (
                <Globe className="size-4 text-green-500" />
              ) : (
                <Lock className="size-4 text-muted-foreground/50" />
              )}
            </button>
          </div>

          {/* Description */}
          {editingDesc ? (
            <div className="flex flex-col gap-2">
              <Textarea
                placeholder="Add a description for this list..."
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                className="text-sm min-h-[60px]"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditingDesc(false); setDescValue(description ?? ""); }}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7" onClick={handleDescriptionSave}>
                  Save
                </Button>
              </div>
            </div>
          ) : description ? (
            <button
              onClick={() => { setDescValue(description ?? ""); setEditingDesc(true); }}
              className="text-sm text-muted-foreground text-left hover:text-foreground transition-colors inline-flex items-center gap-1 group w-fit"
            >
              {description}
              <Pencil className="size-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ) : null}

          {/* Stats + actions row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {total} {total === 1 ? "book" : "books"}
            </span>
            {isPublic === 1 && (
              <>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-2.5" />
                  {followerCount}
                </span>
                <Link
                  href={communityBooklistUrl(list.id, list.name)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="size-2.5" />
                  Public page
                </Link>
              </>
            )}
          </div>

          {/* + Description */}
          {!description && !editingDesc && (
            <button
              onClick={() => { setDescValue(""); setEditingDesc(true); }}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-fit"
            >
              <Plus className="size-3" />
              Description
            </button>
          )}

          {/* Tags */}
          <BooklistTags listId={list.id} initialTags={listTags} />
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <BookSortSelect current={sort} />
        </div>
      </div>
      <div className="flex justify-center mb-4 sm:hidden">
        <BookSortSelect current={sort} />
      </div>
    </>
  );
}
