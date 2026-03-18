"use client";

import React from "react";

interface DetectedEntity {
  original: string;
  translated: string;
  gender: string;
  source: string;
}

const SCENE_BREAK_RE = /^(\.{3,}|-{1,3}|—{1,3}|─{1,}|–{1,3}|\*\s*\*\s*\*|~{3,})$/;

function isSceneBreak(text: string): boolean {
  return SCENE_BREAK_RE.test(text.trim());
}

function isSystemBlock(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) return true;
  const lines = trimmed.split("\n");
  const bracketLines = lines.filter((l) => /^\[.+\]$/.test(l.trim()));
  if (bracketLines.length >= 2) return true;
  // Detect "key": value style system/game UI lines (single-line)
  if (/^"[^"]+"\s*:\s*.+/.test(trimmed)) return true;
  return false;
}

/** Highlight entity names in a plain text string — case-insensitive whole-word matches */
function highlightEntities(
  text: string,
  entities: DetectedEntity[],
  keyBase: number,
): React.ReactNode[] {
  const sorted = entities
    .filter((e) => e.translated.length > 1)
    .sort((a, b) => b.translated.length - a.translated.length);
  if (!sorted.length) return [text];

  const escaped = sorted.map((e) =>
    e.translated.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const regex = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const parts = text.split(regex);
  if (parts.length === 1) return [text];

  const map = new Map(sorted.map((e) => [e.translated.toLowerCase(), e]));
  return parts.map((part, i) => {
    const ent = map.get(part.toLowerCase());
    if (!ent) return part;
    return (
      <span
        key={`e${keyBase}-${i}`}
        className="bg-foreground/8 rounded-sm px-0.5 cursor-help relative group"
      >
        {part}
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1.5 rounded-md bg-popover border border-border shadow-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
          <span className="font-medium">{ent.original}</span>
          {ent.gender && ent.gender !== "N" && (
            <span className="ml-1.5 text-muted-foreground">
              {ent.gender === "M" ? "Male" : "Female"}
            </span>
          )}
        </span>
      </span>
    );
  });
}

/** Parse inline markdown, optionally with entity highlighting on text segments */
function parseInline(
  text: string,
  entities?: DetectedEntity[],
  showEntities?: boolean,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = 0;

  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]/g;

  const pushText = (t: string) => {
    if (!t) return;
    if (showEntities && entities?.length) {
      nodes.push(
        <React.Fragment key={key++}>
          {highlightEntities(t, entities, key * 100)}
        </React.Fragment>,
      );
    } else {
      nodes.push(<React.Fragment key={key++}>{t}</React.Fragment>);
    }
  };

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushText(text.slice(lastIndex, match.index));
    }

    const inner = (t: string) =>
      showEntities && entities?.length
        ? highlightEntities(t, entities, key * 100 + lastIndex)
        : t;

    if (match[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {inner(match[1])}
        </strong>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <em key={key++} className="italic text-foreground/70">
          {inner(match[2])}
        </em>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={key++} className="litrpg-inline">
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <strong key={key++} className="litrpg-bracket">
          [{inner(match[4])}]
        </strong>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    pushText(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function SceneBreak() {
  return (
    <div className="flex items-center justify-center gap-3 my-6 sm:my-8">
      <span className="h-px flex-1 bg-border" />
      <span className="text-muted-foreground/40 text-xs tracking-[0.5em]">
        ···
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function SystemBlock({ text }: { text: string }) {
  let content = text.trim();
  if (content.startsWith("```")) {
    content = content.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
  }
  const lines = content.split("\n").filter((l) => l.trim());

  return (
    <div className="litrpg-panel my-3 sm:my-4">
      {lines.map((line, i) => (
        <div key={i} className="litrpg-line">
          {line.trim()}
        </div>
      ))}
    </div>
  );
}

/**
 * Group consecutive system-block paragraphs into merged blocks.
 * Returns array of { type: "text" | "system" | "break", lines: string[] }
 */
export function groupParagraphs(paragraphs: string[]): { type: "text" | "system" | "break"; lines: string[] }[] {
  const groups: { type: "text" | "system" | "break"; lines: string[] }[] = [];

  for (const p of paragraphs) {
    if (isSceneBreak(p)) {
      groups.push({ type: "break", lines: [p] });
    } else if (isSystemBlock(p)) {
      const last = groups[groups.length - 1];
      if (last && last.type === "system") {
        last.lines.push(p);
      } else {
        groups.push({ type: "system", lines: [p] });
      }
    } else {
      groups.push({ type: "text", lines: [p] });
    }
  }

  return groups;
}

export function ChapterParagraph({
  text,
  className,
  style,
  entities,
  showEntities,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  entities?: DetectedEntity[];
  showEntities?: boolean;
}) {
  if (isSceneBreak(text)) {
    return <SceneBreak />;
  }

  if (isSystemBlock(text)) {
    return <SystemBlock text={text} />;
  }

  return <p className={className} style={style}>{parseInline(text, entities, showEntities)}</p>;
}

/** Render a merged system block (multiple lines in one panel) */
export function SystemBlockGroup({ lines }: { lines: string[] }) {
  return <SystemBlock text={lines.join("\n")} />;
}
