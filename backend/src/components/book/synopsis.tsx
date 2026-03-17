"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface SynopsisProps {
  text: string;
  collapsedLines?: number;
}

export function Synopsis({ text, collapsedLines = 7 }: SynopsisProps) {
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setNeedsClamp(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <div className="relative">
        <p
          ref={ref}
          className="text-sm sm:text-base leading-relaxed whitespace-pre-line break-words text-muted-foreground"
          style={
            !expanded
              ? {
                  WebkitLineClamp: collapsedLines,
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }
              : undefined
          }
        >
          {text}
        </p>
        {!expanded && needsClamp && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      {needsClamp && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 rounded-full px-4 py-1.5 mt-3 mx-auto transition-colors"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown
            className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}
