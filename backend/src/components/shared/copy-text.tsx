"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

interface CopyTextProps {
  text: string;
  children: React.ReactNode;
  className?: string;
}

export function CopyText({ text, children, className }: CopyTextProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 cursor-pointer ${className ?? ""}`}
    >
      {children}
      {copied ? (
        <Check className="size-3 text-muted-foreground shrink-0" />
      ) : (
        <Copy className="size-3 text-muted-foreground/50 shrink-0" />
      )}
    </button>
  );
}
