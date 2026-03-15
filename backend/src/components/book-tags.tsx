"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LoginDialog } from "@/components/login-dialog";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/responsive-dialog";
import { cn } from "@/lib/utils";

interface TagData {
  id: number;
  name: string;
  displayName: string;
  count: number;
  userVoted: boolean;
}

interface EntityTagsProps {
  apiBase: string;
  initialTags: TagData[];
  heading?: string;
  showHeading?: boolean;
}

function EntityTags({ apiBase, initialTags, heading = "Community Tags", showHeading = true }: EntityTagsProps) {
  const { status } = useSession();
  const [tagList, setTagList] = useState(initialTags);
  const [loginOpen, setLoginOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TagData | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: number; name: string; displayName: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/tags?q=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.tags ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!popoverOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, popoverOpen, fetchSuggestions]);

  useEffect(() => {
    if (popoverOpen) {
      fetchSuggestions("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setSuggestions([]);
    }
  }, [popoverOpen, fetchSuggestions]);

  const removeVote = async (tag: TagData) => {
    setRemoveTarget(null);
    setTagList((prev) =>
      prev
        .map((t) => (t.id === tag.id ? { ...t, count: t.count - 1, userVoted: false } : t))
        .filter((t) => t.count > 0),
    );
    try {
      await fetch(apiBase, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id }),
      });
    } catch {
      setTagList(initialTags);
    }
  };

  const handleTagClick = async (tag: TagData) => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }

    if (tag.userVoted) {
      if (tag.count > 1) {
        setRemoveTarget(tag);
      } else {
        removeVote(tag);
      }
    } else {
      setTagList((prev) => {
        const exists = prev.find((t) => t.id === tag.id);
        if (exists) {
          return prev.map((t) => (t.id === tag.id ? { ...t, count: t.count + 1, userVoted: true } : t));
        }
        return [...prev, { ...tag, count: tag.count + 1, userVoted: true }];
      });
      try {
        await fetch(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagName: tag.name }),
        });
      } catch {
        setTagList(initialTags);
      }
    }
  };

  const handleAddTag = async (tagName: string, displayName?: string) => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagName, displayName }),
      });
      if (res.ok) {
        const tagsRes = await fetch(apiBase);
        if (tagsRes.ok) {
          const data = await tagsRes.json();
          setTagList(data.tags ?? []);
        }
        setPopoverOpen(false);
      } else {
        const data = await res.json();
        if (data.error?.startsWith("Max 5 tags")) {
          setPopoverOpen(false);
        }
      }
    } catch {}
    setLoading(false);
  };

  const normalizedQuery = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const exactMatch = suggestions.find((s) => s.name === normalizedQuery);
  const alreadyApplied = tagList.find((t) => t.name === normalizedQuery && t.userVoted);
  const canCreate = normalizedQuery.length >= 2 && !exactMatch && !alreadyApplied;

  const userVotedIds = new Set(tagList.filter((t) => t.userVoted).map((t) => t.id));
  const filteredSuggestions = suggestions.filter((s) => !userVotedIds.has(s.id));

  const sortedTags = [...tagList].sort((a, b) => b.count - a.count);

  return (
    <>
      {(sortedTags.length > 0 || status === "authenticated") && (
        <div>
          {showHeading && (
            <h2 className="text-base sm:text-lg font-medium mb-2">{heading}</h2>
          )}
          <div className={`flex flex-wrap items-center gap-1.5 ${sortedTags.length === 0 ? "justify-center" : "justify-center sm:justify-start"}`}>
          {sortedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              className={cn(
                "text-xs font-medium cursor-pointer transition-colors select-none",
                tag.userVoted
                  ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20"
                  : "hover:bg-accent",
              )}
              onClick={() => handleTagClick(tag)}
            >
              {tag.displayName}
              <span className="ml-1 opacity-60">{tag.count}</span>
            </Badge>
          ))}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className={cn(
                  "rounded-full",
                  sortedTags.length === 0
                    ? "h-8 px-3 gap-1.5 text-xs"
                    : "h-7 w-7 p-0",
                )}
                onClick={() => {
                  if (status !== "authenticated") {
                    setLoginOpen(true);
                    return;
                  }
                }}
              >
                <Plus className="size-3.5" />
                {sortedTags.length === 0 && "Add Tag"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <Input
                ref={inputRef}
                placeholder="Search or create tag..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 text-sm mb-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate) {
                    handleAddTag(normalizedQuery);
                  }
                }}
              />
              <div className="flex flex-col max-h-48 overflow-y-auto">
                {filteredSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex items-center justify-between w-full px-2 py-1.5 text-sm text-left rounded hover:bg-accent transition-colors"
                    onClick={() => handleAddTag(s.name)}
                  >
                    <span>{s.displayName}</span>
                    {s.count > 0 && (
                      <span className="text-xs text-muted-foreground">{s.count}</span>
                    )}
                  </button>
                ))}
                {canCreate && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 text-sm text-left rounded hover:bg-accent transition-colors text-violet-600 dark:text-violet-400"
                    onClick={() => handleAddTag(normalizedQuery)}
                    disabled={loading}
                  >
                    <Plus className="size-3" />
                    Create &ldquo;{normalizedQuery}&rdquo;
                  </button>
                )}
                {filteredSuggestions.length === 0 && !canCreate && query.trim() && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">No matching tags</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
          </div>
        </div>
      )}

      <ResponsiveDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Remove tag</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Remove your vote for &ldquo;{removeTarget?.displayName}&rdquo;? This tag has {removeTarget?.count} {removeTarget?.count === 1 ? "vote" : "votes"} from the community.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => setRemoveTarget(null)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={() => removeTarget && removeVote(removeTarget)}>
            Remove
          </Button>
        </div>
      </ResponsiveDialog>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
}

// Convenience wrappers
export function BookTags({ bookId, initialTags }: { bookId: number; initialTags: TagData[] }) {
  return <EntityTags apiBase={`/api/books/${bookId}/tags`} initialTags={initialTags} />;
}

export function BooklistTags({ listId, initialTags }: { listId: number; initialTags: TagData[] }) {
  return <EntityTags apiBase={`/api/lists/${listId}/tags`} initialTags={initialTags} showHeading={false} />;
}
