"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Bookmark, Plus, Loader2, BookOpen, CheckCircle2, Clock, CircleOff } from "lucide-react";
import { LoginDialog } from "@/components/layout/login-dialog";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/shared/responsive-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ReadingStatus } from "@/lib/types";

interface BookBookmarkProps {
  bookId: number;
  bookmarkCount: number;
  initialBookmarked?: boolean;
  initialStatus?: string | null;
}

interface ListItem {
  id: number;
  name: string;
  hasBook: boolean;
}

const STATUS_OPTIONS: { value: ReadingStatus; label: string; icon: typeof BookOpen; activeClass: string }[] = [
  { value: "reading", label: "Reading", icon: BookOpen, activeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  { value: "completed", label: "Completed", icon: CheckCircle2, activeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  { value: "plan_to_read", label: "Plan to Read", icon: Clock, activeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { value: "dropped", label: "Dropped", icon: CircleOff, activeClass: "bg-neutral-500/15 text-neutral-500 dark:text-neutral-400 border-neutral-500/30" },
];

const STATUS_LABELS: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  plan_to_read: "Plan to Read",
  dropped: "Dropped",
};

export function BookBookmark({ bookId, bookmarkCount, initialBookmarked, initialStatus }: BookBookmarkProps) {
  const { status: authStatus } = useSession();
  const [bookmarked, setBookmarked] = useState(initialBookmarked ?? false);
  const [readingStatus, setReadingStatus] = useState<string | null>(initialStatus ?? null);
  const [count, setCount] = useState(bookmarkCount);
  const [loginOpen, setLoginOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [lists, setLists] = useState<ListItem[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);

  const pendingOps = useRef(0);

  // Saved = bookmarked OR in any list
  const isSavedInList = lists.some((l) => l.hasBook);
  const isSaved = bookmarked || isSavedInList;

  // Listen for bookmark-updated events (e.g., from BookProgress)
  const handleBookmarkUpdated = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.bookmarked != null) setBookmarked(detail.bookmarked);
    if (detail?.status !== undefined) setReadingStatus(detail.status);
    if (detail?.bookmarked && !bookmarked) setCount((c) => c + 1);
  }, [bookmarked]);

  useEffect(() => {
    window.addEventListener("bookmark-updated", handleBookmarkUpdated);
    return () => window.removeEventListener("bookmark-updated", handleBookmarkUpdated);
  }, [handleBookmarkUpdated]);

  // Fetch full data when dialog opens
  useEffect(() => {
    if (!dialogOpen || authStatus !== "authenticated") return;
    if (pendingOps.current > 0) return;
    setListsLoading(true);
    fetch(`/api/books/${bookId}/lists`)
      .then((r) => r.json())
      .then((data) => {
        setBookmarked(data.bookmarked);
        setReadingStatus(data.status ?? null);
        setLists(data.lists ?? []);
      })
      .catch(() => {})
      .finally(() => setListsLoading(false));
  }, [dialogOpen, bookId, authStatus]);

  const handleButtonClick = () => {
    if (authStatus !== "authenticated") {
      setLoginOpen(true);
      return;
    }
    setDialogOpen(true);
  };

  // Ensures bookmark row stays in sync — if user is saving to any list, bookmark must be on
  const ensureBookmarked = () => {
    if (!bookmarked) {
      setBookmarked(true);
      setCount((c) => c + 1);
      pendingOps.current++;
      fetch(`/api/books/${bookId}/bookmark`, { method: "POST" })
        .catch(() => {
          setBookmarked(false);
          setCount((c) => c - 1);
        })
        .finally(() => { pendingOps.current--; });
    }
  };

  const handleBookmarkToggle = async () => {
    const wasBookmarked = bookmarked;

    // Don't allow unchecking bookmark if book is in a custom list
    if (wasBookmarked && isSavedInList) return;

    setBookmarked(!wasBookmarked);
    setCount((c) => c + (wasBookmarked ? -1 : 1));
    if (wasBookmarked) setReadingStatus(null);
    pendingOps.current++;

    try {
      await fetch(`/api/books/${bookId}/bookmark`, {
        method: wasBookmarked ? "DELETE" : "POST",
      });
      window.dispatchEvent(new CustomEvent("bookmark-updated", { detail: { bookId, bookmarked: !wasBookmarked } }));
    } catch {
      setBookmarked(wasBookmarked);
      setCount((c) => c + (wasBookmarked ? 1 : -1));
    } finally {
      pendingOps.current--;
    }
  };

  const handleStatusChange = async (newStatus: ReadingStatus) => {
    const prev = readingStatus;
    const next = readingStatus === newStatus ? null : newStatus;
    setReadingStatus(next);
    pendingOps.current++;

    try {
      await fetch(`/api/books/${bookId}/bookmark`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
    } catch {
      setReadingStatus(prev);
    } finally {
      pendingOps.current--;
    }
  };

  const handleListToggle = async (listId: number, hasBook: boolean) => {
    const adding = !hasBook;
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, hasBook: adding } : l))
    );

    // Auto-bookmark when adding to any list
    if (adding) ensureBookmarked();

    pendingOps.current++;
    try {
      await fetch(`/api/lists/${listId}/items`, {
        method: hasBook ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
    } catch {
      setLists((prev) =>
        prev.map((l) => (l.id === listId ? { ...l, hasBook } : l))
      );
    } finally {
      pendingOps.current--;
    }
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name || creating) return;
    setCreating(true);
    pendingOps.current++;

    ensureBookmarked();

    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        setLists((prev) => [...prev, { id: data.list.id, name: data.list.name, hasBook: true }]);
        setNewListName("");
        await fetch(`/api/lists/${data.list.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId }),
        });
      }
    } catch {}

    pendingOps.current--;
    setCreating(false);
  };

  const buttonLabel = readingStatus && STATUS_LABELS[readingStatus] ? STATUS_LABELS[readingStatus] : "Bookmark";

  return (
    <>
      <Button
        variant={isSaved ? "default" : "outline"}
        onClick={handleButtonClick}
      >
        <Bookmark className={`size-4 ${isSaved ? "fill-current" : ""}`} />
        {buttonLabel}
        {(isSaved || count > 0) && <span className={`tabular-nums ${isSaved ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{count}</span>}
      </Button>

      <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen} className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Save to...</ResponsiveDialogTitle>
          <p className="text-xs text-muted-foreground">Bookmark this book or add it to your lists</p>
        </ResponsiveDialogHeader>

        {listsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col pt-1">
            {/* Default bookmark — distinct styling */}
            <label
              className={`flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                bookmarked
                  ? "bg-blue-500/10"
                  : "hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={bookmarked}
                onCheckedChange={handleBookmarkToggle}
                disabled={bookmarked && isSavedInList}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Bookmarks</span>
                <span className="text-[11px] text-muted-foreground">Your default saved books</span>
              </div>
            </label>

            {/* Reading status selector — only when bookmarked */}
            {bookmarked && (
              <div className="px-3 pt-3 pb-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider pb-2">
                  Reading Status
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {STATUS_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isActive = readingStatus === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleStatusChange(opt.value)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                          isActive
                            ? opt.activeClass
                            : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom lists */}
            {lists.length > 0 && (
              <div className="mt-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 py-1.5">
                  My Lists
                </p>
                {lists.map((list) => (
                  <label
                    key={list.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={list.hasBook}
                      onCheckedChange={() => handleListToggle(list.id, list.hasBook)}
                    />
                    <span className="text-sm truncate">{list.name}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-3 mt-1">
              <Input
                placeholder="New list name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 shrink-0"
                onClick={handleCreateList}
                disabled={!newListName.trim() || creating}
              >
                {creating ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3" />
                )}
              </Button>
            </div>

            <Button
              className="mt-4 w-full"
              size="sm"
              onClick={() => setDialogOpen(false)}
            >
              Done
            </Button>
          </div>
        )}
      </ResponsiveDialog>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
}
