"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

const THEMES = [
  { id: "light", label: "Original", bg: "#ffffff", fg: "#0a0a0a", ring: "ring-border" },
  { id: "focus", label: "Focus", bg: "#FAF8F2", fg: "#3D3D3D", ring: "ring-border" },
  { id: "paper", label: "Paper", bg: "#F5F1E8", fg: "#3D3D3D", ring: "ring-border" },
  { id: "calm", label: "Calm", bg: "#E8DCC8", fg: "#3D3226", ring: "ring-border" },
  { id: "quiet", label: "Quiet", bg: "#3C3C3C", fg: "#D4D4D4", ring: "ring-white/30" },
  { id: "dark", label: "Black", bg: "#000000", fg: "#E8E8E3", ring: "ring-white/30" },
] as const;

const FONT_SIZES = { min: 14, max: 22, default: 16, step: 1 };
const LINE_SPACINGS = [
  { label: "Compact", value: 1.5 },
  { label: "Default", value: 1.75 },
  { label: "Relaxed", value: 2.0 },
  { label: "Spacious", value: 2.25 },
];

function getStoredFontSize(): number {
  if (typeof window === "undefined") return FONT_SIZES.default;
  return Number(localStorage.getItem("reader-font-size")) || FONT_SIZES.default;
}

function getStoredLineSpacing(): number {
  if (typeof window === "undefined") return 1.75;
  return Number(localStorage.getItem("reader-line-spacing")) || 1.75;
}

interface ReaderSettingsPopoverProps {
  children: React.ReactNode;
}

export function ReaderSettingsPopover({ children }: ReaderSettingsPopoverProps) {
  const { theme, setTheme } = useTheme();
  const [fontSize, setFontSize] = useState(FONT_SIZES.default);
  const [lineSpacing, setLineSpacing] = useState(1.75);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setFontSize(getStoredFontSize());
    setLineSpacing(getStoredLineSpacing());
  }, []);

  const updateFontSize = (size: number) => {
    const clamped = Math.max(FONT_SIZES.min, Math.min(FONT_SIZES.max, size));
    setFontSize(clamped);
    localStorage.setItem("reader-font-size", String(clamped));
    window.dispatchEvent(new CustomEvent("reader-settings-changed"));
  };

  const updateLineSpacing = (spacing: number) => {
    setLineSpacing(spacing);
    localStorage.setItem("reader-line-spacing", String(spacing));
    window.dispatchEvent(new CustomEvent("reader-settings-changed"));
  };

  if (!mounted) return <>{children}</>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="flex flex-col gap-4">
          {/* Theme picker */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Theme</Label>
            <div className="grid grid-cols-6 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex flex-col items-center gap-1 group`}
                  title={t.label}
                >
                  <div
                    className={`size-8 rounded-full border-2 transition-all ${
                      theme === t.id ? "ring-2 ring-offset-2 ring-offset-background " + t.ring : "border-border/40 hover:border-border"
                    }`}
                    style={{ backgroundColor: t.bg }}
                  >
                    <span className="flex items-center justify-center h-full text-[8px] font-medium" style={{ color: t.fg }}>
                      Aa
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font size */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Font Size</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="size-8" onClick={() => updateFontSize(fontSize - FONT_SIZES.step)} disabled={fontSize <= FONT_SIZES.min}>
                <Minus className="size-3" />
              </Button>
              <span className="flex-1 text-center text-sm tabular-nums">{fontSize}px</span>
              <Button variant="outline" size="icon" className="size-8" onClick={() => updateFontSize(fontSize + FONT_SIZES.step)} disabled={fontSize >= FONT_SIZES.max}>
                <Plus className="size-3" />
              </Button>
            </div>
          </div>

          {/* Line spacing */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Line Spacing</Label>
            <div className="grid grid-cols-4 gap-1">
              {LINE_SPACINGS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => updateLineSpacing(s.value)}
                  className={`text-xs px-2 py-1.5 rounded-md transition-colors ${
                    lineSpacing === s.value ? "bg-muted font-medium" : "hover:bg-muted/50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
