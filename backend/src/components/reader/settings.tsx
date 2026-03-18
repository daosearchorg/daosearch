"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Minus, Plus, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THEMES = [
  { id: "light", label: "Original", bg: "#ffffff", fg: "#0a0a0a" },
  { id: "focus", label: "Focus", bg: "#FAF8F2", fg: "#3D3D3D" },
  { id: "paper", label: "Paper", bg: "#F4F0E8", fg: "#333025" },
  { id: "calm", label: "Calm", bg: "#EDE6D8", fg: "#2E2920" },
  { id: "quiet", label: "Quiet", bg: "#3C3C3C", fg: "#D4D4D4" },
  { id: "dark", label: "Black", bg: "#000000", fg: "#E8E8E3" },
] as const;

const FONT_SIZES = { min: 14, max: 22, default: 16, step: 1 };
const LINE_SPACINGS = [
  { label: "Compact", value: 1.5 },
  { label: "Default", value: 1.75 },
  { label: "Relaxed", value: 2.0 },
  { label: "Spacious", value: 2.25 },
];

const TIERS = [
  { id: "free", label: "Free", desc: "Google Translate" },
  { id: "premium", label: "Dao AI", desc: "Gemini + Entities" },
  { id: "byok", label: "BYOK", desc: "Your own API key" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ReaderSettingsProps {
  onSaved?: () => void;
  defaultTab?: "reader" | "translation";
}

export function ReaderSettings({ onSaved, defaultTab = "reader" }: ReaderSettingsProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Reader settings (localStorage)
  const [fontSize, setFontSize] = useState(FONT_SIZES.default);
  const [lineSpacing, setLineSpacing] = useState(1.75);
  const [prefetch, setPrefetch] = useState(true);

  // Translation settings (DB)
  const [tier, setTier] = useState("free");
  const [byokEndpoint, setByokEndpoint] = useState("https://api.openai.com/v1");
  const [byokModel, setByokModel] = useState("gpt-4o");
  const [byokKey, setByokKey] = useState("");
  const [hasByokKey, setHasByokKey] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustomInstructions, setShowCustomInstructions] = useState(false);
  const [translationLoading, setTranslationLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    setFontSize(Number(localStorage.getItem("reader-font-size")) || FONT_SIZES.default);
    setLineSpacing(Number(localStorage.getItem("reader-line-spacing")) || 1.75);
    setPrefetch(localStorage.getItem("reader-prefetch") !== "false");

    fetch("/api/user/translation-settings")
      .then((r) => r.json())
      .then((data) => {
        setTier(data.tier || "free");
        if (data.byokEndpoint) setByokEndpoint(data.byokEndpoint);
        if (data.byokModel) setByokModel(data.byokModel);
        setCustomInstructions(data.customInstructions || "");
        setShowCustomInstructions(!!data.customInstructions);
        setHasByokKey(data.hasByokKey || false);
      })
      .catch(() => {})
      .finally(() => setTranslationLoading(false));
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

  const handleSaveTranslation = async () => {
    setSaving(true);
    try {
      await fetch("/api/user/translation-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          ...(tier === "byok" ? {
            byokEndpoint,
            byokModel,
            ...(byokKey ? { byokKey } : {}),
          } : {}),
          customInstructions: showCustomInstructions ? customInstructions : null,
        }),
      });
      if (byokKey) { setHasByokKey(true); setByokKey(""); }
      // Notify chapter reader that translation tier changed
      window.dispatchEvent(new CustomEvent("translation-settings-changed", { detail: { tier } }));
      onSaved?.();
    } catch {}
    setSaving(false);
  };

  if (!mounted) return null;

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="reader" className="flex-1">Reader</TabsTrigger>
        <TabsTrigger value="translation" className="flex-1">Translation</TabsTrigger>
      </TabsList>

      {/* ----------------------------------------------------------------- */}
      {/* Reader tab — theme, font size, line spacing */}
      {/* ----------------------------------------------------------------- */}
      <TabsContent value="reader" className="mt-4">
        <div className="flex flex-col gap-5">
          {/* Theme picker */}
          <div className="flex flex-col gap-3">
            <Label className="text-sm">Theme</Label>
            <div className="grid grid-cols-6 gap-3">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => setTheme(t.id)} className="flex flex-col items-center gap-1.5" title={t.label}>
                  <div
                    className={`size-10 rounded-full border-2 transition-all ${
                      theme === t.id ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/20" : "border-border/40 hover:border-border"
                    }`}
                    style={{ backgroundColor: t.bg }}
                  >
                    <span className="flex items-center justify-center h-full text-[10px] font-medium" style={{ color: t.fg }}>Aa</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font size */}
          <div className="flex flex-col gap-3">
            <Label className="text-sm">Font Size</Label>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="size-9" onClick={() => updateFontSize(fontSize - FONT_SIZES.step)} disabled={fontSize <= FONT_SIZES.min}>
                <Minus className="size-4" />
              </Button>
              <button
                className="flex-1 text-center text-sm tabular-nums hover:text-muted-foreground transition-colors"
                onClick={() => updateFontSize(FONT_SIZES.default)}
                title="Reset to default"
              >
                {fontSize}px{fontSize !== FONT_SIZES.default && <span className="text-xs text-muted-foreground ml-1">(reset)</span>}
              </button>
              <Button variant="outline" size="icon" className="size-9" onClick={() => updateFontSize(fontSize + FONT_SIZES.step)} disabled={fontSize >= FONT_SIZES.max}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          {/* Line spacing */}
          <div className="flex flex-col gap-3">
            <Label className="text-sm">Line Spacing</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {LINE_SPACINGS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => updateLineSpacing(s.value)}
                  className={`text-sm px-2.5 py-2 rounded-md transition-colors ${
                    lineSpacing === s.value ? "bg-muted font-medium" : "hover:bg-muted/50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </TabsContent>

      {/* ----------------------------------------------------------------- */}
      {/* Translation tab */}
      {/* ----------------------------------------------------------------- */}
      <TabsContent value="translation" className="mt-4">
        {translationLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Tier selection */}
            <div className="grid grid-cols-3 gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors text-center ${
                    tier === t.id ? "border-foreground/20 bg-muted" : "border-border/60 hover:bg-muted/50"
                  }`}
                >
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="text-xs text-muted-foreground leading-tight">{t.desc}</span>
                </button>
              ))}
            </div>

            {/* Tier details */}
            {tier === "free" && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs">Client-side</Badge>
                <Badge variant="secondary" className="text-xs">No entities</Badge>
                <Badge variant="secondary" className="text-xs">Instant</Badge>
              </div>
            )}

            {tier === "premium" && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs">Gemini 2.5 Flash</Badge>
                <Badge variant="secondary" className="text-xs">Entity detection</Badge>
                <Badge variant="secondary" className="text-xs">Streaming</Badge>
              </div>
            )}

            {tier === "byok" && (
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-xs">OpenAI-compatible</Badge>
                  <Badge variant="secondary" className="text-xs">Entity detection</Badge>
                  <Badge variant="secondary" className="text-xs">Streaming</Badge>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="byok-endpoint">Endpoint</Label>
                  <Input id="byok-endpoint" value={byokEndpoint} onChange={(e) => setByokEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" />
                  <p className="text-xs text-muted-foreground">OpenAI, OpenRouter, DeepSeek, Together AI, Groq, Ollama, vLLM</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="byok-model">Model</Label>
                    <Input id="byok-model" value={byokModel} onChange={(e) => setByokModel(e.target.value)} placeholder="gpt-4o" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="byok-key">API Key</Label>
                    <Input id="byok-key" type="password" value={byokKey} onChange={(e) => setByokKey(e.target.value)} placeholder={hasByokKey ? "•••• (saved)" : "sk-..."} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <Lock className="size-3 shrink-0 mt-0.5" />
                  Encrypted with AES-256-GCM. Never exposed to browser.
                </p>
              </div>
            )}

            {/* Custom instructions */}
            {(tier === "premium" || tier === "byok") && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="custom-toggle" className="text-sm cursor-pointer">Custom Instructions</Label>
                  <Switch id="custom-toggle" checked={showCustomInstructions} onCheckedChange={(c) => { setShowCustomInstructions(c); if (!c) setCustomInstructions(""); }} />
                </div>
                {showCustomInstructions && (
                  <Textarea value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Translate cultivation terms literally, keep Chinese honorifics..."
                    rows={2} className="text-sm" />
                )}
              </div>
            )}

            {/* Prefetch */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Prefetch Next Chapter</Label>
                <p className="text-xs text-muted-foreground">Pre-translates the next chapter in the background</p>
              </div>
              <Switch
                checked={prefetch}
                onCheckedChange={(checked) => {
                  setPrefetch(checked);
                  localStorage.setItem("reader-prefetch", String(checked));
                  window.dispatchEvent(new CustomEvent("reader-settings-changed"));
                }}
              />
            </div>

            <Button onClick={handleSaveTranslation} disabled={saving} className="w-full">
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
