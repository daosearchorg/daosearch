"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Eye, Play, Loader2 } from "lucide-react";
import { LoginDialog } from "@/components/login-dialog";
import { Button } from "@/components/ui/button";
import { BookSourcePicker } from "@/components/book-source-picker";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/responsive-dialog";

interface BookProgressProps {
  bookId: number;
  firstChapterId?: number | null;
  initialSeq?: number | null;
  bookTitleRaw?: string;
  bookUrl?: string;
}

export function BookProgress({ bookId, firstChapterId, initialSeq, bookTitleRaw, bookUrl }: BookProgressProps) {
  const router = useRouter();
  const { status } = useSession();
  const [seq, setSeq] = useState<number | null>(initialSeq ?? null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Listen for progress updates from the reader
  useEffect(() => {
    const handler = (e: Event) => {
      const newSeq = (e as CustomEvent<number>).detail;
      if (newSeq != null) setSeq(newSeq);
    };
    window.addEventListener("progress-updated", handler);
    return () => window.removeEventListener("progress-updated", handler);
  }, []);

  const handleStartReading = useCallback(() => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }
    // Open source selection dialog
    setSourcesOpen(true);
  }, [status]);

  const handleSourceSelect = useCallback((sourceUrl: string, domain: string) => {
    setSourcesOpen(false);
    router.push(`/book/${bookId}/read?seq=1&source=${encodeURIComponent(sourceUrl)}`);
  }, [bookId, router]);

  const handleReadingClick = useCallback(async () => {
    if (!seq) return;
    // Try to get last-used source
    try {
      const res = await fetch(`/api/books/${bookId}/source`);
      const data = await res.json();
      if (data.novelUrl) {
        router.push(`/book/${bookId}/read?seq=${seq}&source=${encodeURIComponent(data.novelUrl)}`);
        return;
      }
    } catch { /* fall through */ }
    // No saved source — open source selection
    setSourcesOpen(true);
  }, [bookId, router, seq]);

  if (seq != null) {
    return (
      <>
        <Button variant="default" className="w-full" onClick={handleReadingClick}>
          <Eye className="size-4" />
          Continue Ch. {seq}
        </Button>
        <ResponsiveDialog open={sourcesOpen} onOpenChange={setSourcesOpen} className="sm:max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Sources</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>Choose where to continue reading</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="mt-4">
            <BookSourcePicker
              bookId={bookId}
              bookTitleRaw={bookTitleRaw || ""}
              bookUrl={bookUrl}
              onSelect={(url) => {
                setSourcesOpen(false);
                router.push(`/book/${bookId}/read?seq=${seq}&source=${encodeURIComponent(url)}`);
              }}
            />
          </div>
        </ResponsiveDialog>
      </>
    );
  }

  return (
    <>
      <Button variant="default" className="w-full" onClick={handleStartReading}>
        <Play className="size-4 fill-current" />
        Start Reading
      </Button>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <ResponsiveDialog open={sourcesOpen} onOpenChange={setSourcesOpen} className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Sources</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Choose where to read from</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="mt-4">
          <BookSourcePicker
            bookId={bookId}
            bookTitleRaw={bookTitleRaw || ""}
            bookUrl={bookUrl}
            onSelect={handleSourceSelect}
          />
        </div>
      </ResponsiveDialog>
    </>
  );
}
