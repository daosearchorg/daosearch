"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2, Plus, MoreHorizontal, Pencil, Trash2, List, Globe, Lock, Users, ExternalLink } from "lucide-react";
import { communityBooklistUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/responsive-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";


interface BookList {
  id: number;
  name: string;
  description: string | null;
  isPublic: number;
  followerCount: number;
  itemCount: number;
  coverImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ListsClientProps {
  initialLists: BookList[];
}

export function ListsClient({ initialLists }: ListsClientProps) {
  const router = useRouter();
  const [lists, setLists] = useState(initialLists);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BookList | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);

    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        setLists((prev) => [...prev, { ...data.list, itemCount: 0, followerCount: 0 }]);
        setNewName("");
        setShowCreate(false);
        router.refresh();
      }
    } catch {}

    setCreating(false);
  };

  const handleDelete = async (listId: number) => {
    setDeleteTarget(null);
    setLists((prev) => prev.filter((l) => l.id !== listId));
    try {
      await fetch(`/api/lists/${listId}`, { method: "DELETE" });
      router.refresh();
    } catch {
      const res = await fetch("/api/lists");
      const data = await res.json();
      setLists(data.lists ?? []);
    }
  };

  const handleRename = async (listId: number) => {
    const name = editName.trim();
    if (!name) return;

    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name } : l)));
    setEditingId(null);

    try {
      await fetch(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } catch {}
  };

  const handleTogglePublic = async (listId: number, currentIsPublic: number) => {
    const newIsPublic = currentIsPublic === 1 ? 0 : 1;
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, isPublic: newIsPublic } : l)));

    try {
      await fetch(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: newIsPublic }),
      });
    } catch {}
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">My Lists</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize books into custom lists
          </p>
        </div>
        {!showCreate && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="size-3" />
            New list
          </Button>
        )}
      </div>

      {showCreate && (
        <div className="flex gap-2 mb-6">
          <Input
            placeholder="List name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="h-8 text-sm"
            autoFocus
          />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || creating}>
            {creating && <Loader2 className="size-3 animate-spin" />}
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewName(""); }}>
            Cancel
          </Button>
        </div>
      )}

      {lists.length === 0 ? (
        <div className="text-center py-16">
          <List className="size-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No lists yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a list to start organizing books
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
            {lists.map((list) => (
              <div key={list.id}>
                <div className="flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-accent/50">
                  {list.coverImageUrl ? (
                    <Image
                      src={list.coverImageUrl}
                      alt=""
                      width={56}
                      height={75}
                      className="rounded-lg object-cover shrink-0 w-14 h-[75px]"
                    />
                  ) : (
                    <div className="w-14 h-[75px] rounded-lg bg-muted shrink-0" />
                  )}
                  {editingId === list.id ? (
                    <div className="flex-1 flex gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(list.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-7 text-sm"
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => handleRename(list.id)}>
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Link href={`/account/lists/${list.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm sm:text-base font-medium truncate">{list.name}</p>
                        {list.isPublic === 1 ? (
                          <Globe className="size-3 text-green-500 shrink-0" />
                        ) : (
                          <Lock className="size-3 text-muted-foreground/50 shrink-0" />
                        )}
                      </div>
                      {list.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{list.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[11px] text-muted-foreground">
                          {list.itemCount} {list.itemCount === 1 ? "book" : "books"}
                        </p>
                        {list.isPublic === 1 && (
                          <>
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Users className="size-2.5" />
                              {list.followerCount}
                            </span>
                            <span
                              role="link"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.open(communityBooklistUrl(list.id, list.name), "_blank");
                              }}
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <ExternalLink className="size-2.5" />
                              Public page
                            </span>
                          </>
                        )}
                      </div>
                    </Link>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditingId(list.id); setEditName(list.name); }}>
                        <Pencil className="size-3" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleTogglePublic(list.id, list.isPublic)}>
                        {list.isPublic === 1 ? (
                          <><Lock className="size-3" /> Make Private</>
                        ) : (
                          <><Globe className="size-3" /> Make Public</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteTarget(list)}
                      >
                        <Trash2 className="size-3" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
      )}

      <ResponsiveDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Delete list</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This will remove the list and all its saved books. This action cannot be undone.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={() => deleteTarget && handleDelete(deleteTarget.id)}>
            Delete
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
