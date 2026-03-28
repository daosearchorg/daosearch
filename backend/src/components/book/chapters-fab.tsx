"use client";

import { useState, useEffect } from "react";
import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { BookChapters } from "@/components/book/chapters";

interface BookChaptersFabProps {
  bookId: number;
  chapterCount: number;
  progressSeq: number | null;
  bookTitle?: string;
}

export function BookChaptersFab({ bookId, chapterCount, progressSeq, bookTitle }: BookChaptersFabProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-chapters-drawer", handler);
    return () => window.removeEventListener("open-chapters-drawer", handler);
  }, []);

  return (
    <div className="sm:hidden">
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-6 right-6 z-40 size-12 rounded-full shadow-lg"
          >
            <List className="size-5" />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base font-medium">
              Chapters
              <span className="text-muted-foreground font-normal ml-1.5">({chapterCount})</span>
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            <BookChapters
              bookId={bookId}
              initialItems={[]}
              initialCurrentSeq={progressSeq}
              bookTitle={bookTitle}
              singleColumn
/>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
