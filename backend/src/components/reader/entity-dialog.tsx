"use client";

import { useState, useEffect } from "react";
import { Loader2, Trash2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Types ───────────────────────────────────────────────────

export interface EntityData {
  id?: number | null;
  original: string;
  translated: string;
  gender: string;
}

interface EntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: EntityData;
  bookId: number;
  onSaved: () => void;
}

// ─── Gender Toggle ──────────────────────────────────────────

const GENDERS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "N", label: "Neutral" },
] as const;

function GenderToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border text-xs overflow-hidden">
      {GENDERS.map((g) => (
        <button
          key={g.value}
          type="button"
          className={`px-3 py-1.5 transition-colors ${
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

// ─── Form Content ───────────────────────────────────────────

function EntityForm({
  entity,
  bookId,
  onSaved,
  onOpenChange,
}: EntityDialogProps) {
  const [translated, setTranslated] = useState(entity.translated);
  const [gender, setGender] = useState(entity.gender || "N");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [makingGeneral, setMakingGeneral] = useState(false);
  const [isInGeneral, setIsInGeneral] = useState(false);

  // Check if entity is already in general glossary
  useEffect(() => {
    fetch("/api/reader/entities/general")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.entities) {
          const match = data.entities.some(
            (e: { originalName: string }) => e.originalName === entity.original,
          );
          setIsInGeneral(match);
        }
      })
      .catch(() => {});
  }, [entity.original]);

  const handleSave = async () => {
    if (!entity.id || !translated.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reader/entities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entity.id,
          translatedTerm: translated.trim(),
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
    if (!entity.id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/reader/entities?id=${entity.id}`, {
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

  const handleMakeGeneral = async () => {
    if (!entity.id) return;
    setMakingGeneral(true);
    try {
      const res = await fetch("/api/reader/entities/make-general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookEntityId: entity.id,
          bookId,
        }),
      });
      if (res.ok) {
        onSaved();
        onOpenChange(false);
      }
    } catch {
      // ignore
    } finally {
      setMakingGeneral(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Original</Label>
        <div className="text-sm px-3 py-2 rounded-md bg-muted/50 select-all">
          {entity.original}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="entity-translated" className="text-xs">
          Translation
        </Label>
        <Input
          id="entity-translated"
          value={translated}
          onChange={(e) => setTranslated(e.target.value)}
          placeholder="English translation"
          className="h-9 selection:bg-primary/20 selection:text-foreground"
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

        {entity.id && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMakeGeneral}
              disabled={makingGeneral || isInGeneral}
              title={isInGeneral ? "Already in your general glossary" : "Copy to your general glossary"}
            >
              {makingGeneral ? (
                <Loader2 className="size-3 animate-spin mr-1.5" />
              ) : (
                <Globe className="size-3 mr-1.5" />
              )}
              {isInGeneral ? "In General" : "Make General"}
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
          </>
        )}
      </div>
    </div>
  );
}

// ─── Responsive Dialog ──────────────────────────────────────

export function EntityDialog(props: EntityDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={props.onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Edit Entity</DrawerTitle>
            <DrawerDescription>
              Customize how this name is translated.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">
            <EntityForm {...props} />
          </div>
          <DrawerFooter />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Entity</DialogTitle>
          <DialogDescription>
            Customize how this name is translated.
          </DialogDescription>
        </DialogHeader>
        <EntityForm {...props} />
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
