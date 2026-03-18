"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Trash2, Globe } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────

interface GeneralEntity {
  id: number;
  originalName: string;
  translatedName: string;
  gender: string;
}

interface GeneralGlossarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Gender Toggle ──────────────────────────────────────────

const GENDERS = [
  { value: "M", label: "M" },
  { value: "F", label: "F" },
  { value: "N", label: "N" },
] as const;

function GenderToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-full border border-border text-xs overflow-hidden">
      {GENDERS.map((g) => (
        <button
          key={g.value}
          type="button"
          className={`px-3 py-1 transition-colors ${
            value === g.value
              ? "bg-foreground text-background font-medium"
              : "hover:bg-muted/50"
          }`}
          onClick={() => onChange(g.value)}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}

// ─── Add Entity Dialog ──────────────────────────────────────

function AddEntityDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isMobile = useIsMobile();
  const [original, setOriginal] = useState("");
  const [translated, setTranslated] = useState("");
  const [gender, setGender] = useState("N");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!original.trim() || !translated.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reader/entities/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: original.trim(),
          translatedName: translated.trim(),
          gender,
        }),
      });
      if (res.ok) {
        setOriginal("");
        setTranslated("");
        setGender("N");
        onSaved();
        onOpenChange(false);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const form = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="general-original" className="text-xs">
          Original
        </Label>
        <Input
          id="general-original"
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
          placeholder="Chinese term"
          className="h-9"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="general-translated" className="text-xs">
          Translation
        </Label>
        <Input
          id="general-translated"
          value={translated}
          onChange={(e) => setTranslated(e.target.value)}
          placeholder="English translation"
          className="h-9"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Gender</Label>
        <GenderToggle value={gender} onChange={setGender} />
      </div>
      <Button onClick={handleSave} disabled={saving || !original.trim() || !translated.trim()} size="sm">
        {saving && <Loader2 className="size-3 animate-spin mr-1.5" />}
        Add Entity
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Add General Entity</DrawerTitle>
            <DrawerDescription>
              Add a translation that applies across all books.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">{form}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add General Entity</DialogTitle>
          <DialogDescription>
            Add a translation that applies across all books.
          </DialogDescription>
        </DialogHeader>
        {form}
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Entity Dialog ─────────────────────────────────────

function EditGeneralEntityDialog({
  open,
  onOpenChange,
  entity,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: GeneralEntity;
  onSaved: () => void;
}) {
  const isMobile = useIsMobile();
  const [translated, setTranslated] = useState(entity.translatedName);
  const [gender, setGender] = useState(entity.gender || "N");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!translated.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reader/entities/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entity.id,
          originalName: entity.originalName,
          translatedName: translated.trim(),
          gender,
        }),
      });
      if (res.ok) {
        onSaved();
        onOpenChange(false);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/reader/entities/general?id=${entity.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onSaved();
        onOpenChange(false);
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  const form = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Original</Label>
        <div className="text-sm px-3 py-2 rounded-md bg-muted/50 select-all">
          {entity.originalName}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-general-translated" className="text-xs">
          Translation
        </Label>
        <Input
          id="edit-general-translated"
          value={translated}
          onChange={(e) => setTranslated(e.target.value)}
          placeholder="English translation"
          className="h-9"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Gender</Label>
        <GenderToggle value={gender} onChange={setGender} />
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || !translated.trim()} size="sm">
          {saving && <Loader2 className="size-3 animate-spin mr-1.5" />}
          Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="ml-auto text-destructive hover:text-destructive"
        >
          {deleting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Trash2 className="size-3" />
          )}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Edit General Entity</DrawerTitle>
            <DrawerDescription>
              This translation applies across all books.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">{form}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit General Entity</DialogTitle>
          <DialogDescription>
            This translation applies across all books.
          </DialogDescription>
        </DialogHeader>
        {form}
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

// ─── Entity List ─────────────────────────────────────────────

function GeneralEntityList() {
  const [entities, setEntities] = useState<GeneralEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<GeneralEntity | null>(null);

  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reader/entities/general");
      if (res.ok) {
        const data = await res.json();
        setEntities(data.entities || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  const filtered = search.trim()
    ? entities.filter(
        (e) =>
          e.originalName.toLowerCase().includes(search.toLowerCase()) ||
          e.translatedName.toLowerCase().includes(search.toLowerCase()),
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
      <div className="px-4 pb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entities..."
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-3.5 mr-1" />
          Add
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {entities.length === 0
              ? "No general entities yet. Add translations that apply across all books."
              : "No matches found."}
          </p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((entity) => (
              <button
                key={entity.id}
                type="button"
                className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md hover:bg-muted/50 text-left transition-colors"
                onClick={() => setEditingEntity(entity)}
              >
                <Globe className="size-3 text-muted-foreground/50 shrink-0" />
                <span className="text-sm text-muted-foreground shrink-0 min-w-[60px] truncate">
                  {entity.originalName}
                </span>
                <span className="text-sm flex-1 min-w-0 truncate">
                  {entity.translatedName}
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

      <AddEntityDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={loadEntities}
      />

      {editingEntity && (
        <EditGeneralEntityDialog
          open={!!editingEntity}
          onOpenChange={(open) => {
            if (!open) setEditingEntity(null);
          }}
          entity={editingEntity}
          onSaved={loadEntities}
        />
      )}
    </>
  );
}

// ─── Responsive Sheet ────────────────────────────────────────

export function GeneralGlossarySheet({
  open,
  onOpenChange,
}: GeneralGlossarySheetProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>General Glossary</DrawerTitle>
            <DrawerDescription>
              Translations that apply across all books.
            </DrawerDescription>
          </DrawerHeader>
          <GeneralEntityList />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>General Glossary</SheetTitle>
          <SheetDescription>
            Translations that apply across all books.
          </SheetDescription>
        </SheetHeader>
        <GeneralEntityList />
      </SheetContent>
    </Sheet>
  );
}
