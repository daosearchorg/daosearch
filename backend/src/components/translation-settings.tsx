"use client";

import { useState, useEffect } from "react";
import { Loader2, Lock, Zap, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface TranslationSettingsProps {
  onSaved?: () => void;
}

export function TranslationSettings({ onSaved }: TranslationSettingsProps) {
  const [tier, setTier] = useState("free");
  const [byokEndpoint, setByokEndpoint] = useState("https://api.openai.com/v1");
  const [byokModel, setByokModel] = useState("gpt-4o");
  const [byokKey, setByokKey] = useState("");
  const [hasByokKey, setHasByokKey] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustomInstructions, setShowCustomInstructions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/translation-settings")
      .then((r) => r.json())
      .then((data) => {
        setTier(data.tier || "free");
        setByokEndpoint(data.byokEndpoint || "https://api.openai.com/v1");
        setByokModel(data.byokModel || "gpt-4o");
        setCustomInstructions(data.customInstructions || "");
        setShowCustomInstructions(!!data.customInstructions);
        setHasByokKey(data.hasByokKey || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/user/translation-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          byokEndpoint: tier === "byok" ? byokEndpoint : null,
          byokModel: tier === "byok" ? byokModel : null,
          byokKey: tier === "byok" && byokKey ? byokKey : undefined,
          customInstructions: showCustomInstructions ? customInstructions : null,
        }),
      });
      if (byokKey) {
        setHasByokKey(true);
        setByokKey("");
      }
      onSaved?.();
    } catch {}
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tiers = [
    { id: "free", label: "Free", desc: "Google Translate", icon: Zap },
    { id: "premium", label: "DaoSearch AI", desc: "Gemini + Entities", icon: Zap },
    { id: "byok", label: "BYOK", desc: "Your own API key", icon: Key },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      {/* Tier selection */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm">Translation Method</Label>
        <div className="grid grid-cols-3 gap-2">
          {tiers.map((t) => (
            <button
              key={t.id}
              onClick={() => setTier(t.id)}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors text-center ${
                tier === t.id
                  ? "border-foreground/20 bg-muted"
                  : "border-border/60 hover:bg-muted/50"
              }`}
            >
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-[11px] text-muted-foreground leading-tight">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tier details */}
      {tier === "free" && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>Translates directly in your browser using Google Translate. Fast and free, but lower quality.</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs">Client-side</Badge>
            <Badge variant="secondary" className="text-xs">No entity support</Badge>
            <Badge variant="secondary" className="text-xs">Instant</Badge>
          </div>
        </div>
      )}

      {tier === "premium" && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>AI-powered translation with automatic entity detection. Character names, places, and terms are kept consistent across chapters.</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs">Gemini 2.5 Flash</Badge>
            <Badge variant="secondary" className="text-xs">Entity detection</Badge>
            <Badge variant="secondary" className="text-xs">Streaming</Badge>
          </div>
        </div>
      )}

      {tier === "byok" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs">OpenAI-compatible</Badge>
            <Badge variant="secondary" className="text-xs">Entity detection</Badge>
            <Badge variant="secondary" className="text-xs">Streaming</Badge>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="byok-endpoint">Endpoint</Label>
            <Input id="byok-endpoint" value={byokEndpoint} onChange={(e) => setByokEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" />
            <p className="text-[11px] text-muted-foreground">
              OpenAI, OpenRouter, DeepSeek, Together AI, Groq, Ollama, vLLM, or any OpenAI-compatible API.
            </p>
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

          <p className="text-[11px] text-muted-foreground flex items-start gap-1">
            <Lock className="size-3 shrink-0 mt-0.5" />
            Encrypted with AES-256-GCM. Never exposed to browser. Costs billed by your provider.
          </p>
        </div>
      )}

      {/* Custom instructions toggle — for premium and byok */}
      {(tier === "premium" || tier === "byok") && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="custom-toggle" className="text-sm cursor-pointer">Custom Instructions</Label>
            <Switch
              id="custom-toggle"
              checked={showCustomInstructions}
              onCheckedChange={(checked) => {
                setShowCustomInstructions(checked);
                if (!checked) setCustomInstructions("");
              }}
            />
          </div>
          {showCustomInstructions && (
            <div className="flex flex-col gap-1.5">
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g. Translate cultivation terms literally, keep Chinese honorifics, use British English..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Appended to the translation system prompt. Use to customize style, terminology, or formatting.
              </p>
            </div>
          )}
        </div>
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}
