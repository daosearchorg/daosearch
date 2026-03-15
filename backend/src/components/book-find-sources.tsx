"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookSourcePicker } from "@/components/book-source-picker";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/responsive-dialog";

interface BookFindSourcesProps {
  bookId: number;
  bookTitleRaw: string;
  bookUrl?: string;
  currentSeq?: number;
}

export function BookFindSources({
  bookId,
  bookTitleRaw,
  bookUrl,
  currentSeq,
}: BookFindSourcesProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleSelect = (sourceUrl: string, domain: string) => {
    setOpen(false);
    const seq = currentSeq || 1;
    router.push(`/book/${bookId}/read?seq=${seq}&source=${encodeURIComponent(sourceUrl)}`);
  };

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Search className="size-4" />
        Sources
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Sources</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Choose where to read from
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="mt-4">
          <BookSourcePicker
            bookId={bookId}
            bookTitleRaw={bookTitleRaw}
            bookUrl={bookUrl}
            onSelect={handleSelect}
          />
        </div>
      </ResponsiveDialog>
    </>
  );
}
