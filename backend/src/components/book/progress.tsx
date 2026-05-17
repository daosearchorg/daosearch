"use client";

import { useState, useEffect } from "react";
import { BookOpen, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BookProgressProps {
  bookId: number;
  firstChapterId?: number | null;
  initialSeq?: number | null;
  bookTitleRaw?: string;
  bookTitle?: string;
  bookUrl?: string;
}

export function BookProgress({ initialSeq }: BookProgressProps) {
  const [seq, setSeq] = useState<number | null>(initialSeq ?? null);

  useEffect(() => {
    const handler = (e: Event) => {
      const newSeq = (e as CustomEvent<number>).detail;
      if (newSeq != null) setSeq(newSeq);
    };
    window.addEventListener("progress-updated", handler);
    return () => window.removeEventListener("progress-updated", handler);
  }, []);

  const handleClick = () => {
    // Mobile: open the chapters drawer. Desktop: scroll to the chapters section.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      window.dispatchEvent(new Event("open-chapters-drawer"));
      return;
    }
    const el = document.getElementById("chapters");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.dispatchEvent(new Event("open-chapters-drawer"));
    }
  };

  return (
    <Button variant="default" className="w-full" onClick={handleClick}>
      {seq != null ? (
        <>
          <BookOpen className="size-4" />
          Continue · Ch. {seq}
        </>
      ) : (
        <>
          <Play className="size-4 fill-current" />
          Read Now
        </>
      )}
    </Button>
  );
}
