"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Eye, Play } from "lucide-react";
import { LoginDialog } from "@/components/layout/login-dialog";
import { Button } from "@/components/ui/button";

interface BookProgressProps {
  bookId: number;
  firstChapterId?: number | null;
  initialSeq?: number | null;
  bookTitleRaw?: string;
  bookUrl?: string;
}

export function BookProgress({ bookId, initialSeq, bookTitleRaw }: BookProgressProps) {
  const router = useRouter();
  const { status } = useSession();
  const [seq, setSeq] = useState<number | null>(initialSeq ?? null);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const newSeq = (e as CustomEvent<number>).detail;
      if (newSeq != null) setSeq(newSeq);
    };
    window.addEventListener("progress-updated", handler);
    return () => window.removeEventListener("progress-updated", handler);
  }, []);

  const handleClick = () => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }
    router.push(`/reader?book=${bookId}`);
    // For "Start Reading" (no saved progress), also open Google search in a new tab
    if (seq == null && bookTitleRaw) {
      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(bookTitleRaw + " 阅读")}`;
      window.open(googleSearchUrl, "_blank");
    }
  };

  return (
    <>
      <Button variant="default" className="w-full" onClick={handleClick}>
        {seq != null ? (
          <>
            <Eye className="size-4" />
            Continue Ch. {seq}
          </>
        ) : (
          <>
            <Play className="size-4 fill-current" />
            Start Reading
          </>
        )}
      </Button>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
}
