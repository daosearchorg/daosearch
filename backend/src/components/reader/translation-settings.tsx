"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface TranslationSettingsProps {
  isAuthenticated: boolean;
}

export function TranslationSettings({ isAuthenticated }: TranslationSettingsProps) {
  const [tier, setTier] = useState<string>("free");
  const [byokEndpoint, setByokEndpoint] = useState("");
  const [byokModel, setByokModel] = useState("");
  const [byokKey, setByokKey] = useState("");
  const [hasByokKey, setHasByokKey] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  // Load settings on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/user/translation-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.tier) setTier(data.tier);
        if (data.byokEndpoint) setByokEndpoint(data.byokEndpoint);
        if (data.byokModel) setByokModel(data.byokModel);
        setHasByokKey(!!data.hasByokKey);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const handleTierChange = useCallback(
    (newTier: string) => {
      setTier(newTier);
      window.dispatchEvent(
        new CustomEvent("translation-settings-changed", { detail: { tier: newTier } }),
      );

      if (!isAuthenticated) return;

      // Persist tier change immediately
      fetch("/api/user/translation-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: newTier,
          byokEndpoint: byokEndpoint || null,
          byokModel: byokModel || null,
        }),
      }).catch(() => {});
    },
    [isAuthenticated, byokEndpoint, byokModel],
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/user/translation-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          byokEndpoint: byokEndpoint || null,
          byokModel: byokModel || null,
          byokKey: byokKey || undefined,
        }),
      });
      if (res.ok) {
        setSaveStatus("success");
        if (byokKey) {
          setHasByokKey(true);
          setByokKey("");
        }
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestStatus("idle");
    setTestMessage("");

    const key = byokKey || undefined;
    const endpoint = (byokEndpoint || "https://api.openai.com/v1").replace(/\/+$/, "");
    const testModel = byokModel || "gpt-4o-mini";

    if (!key && !hasByokKey) {
      setTestStatus("error");
      setTestMessage("No API key provided");
      setTesting(false);
      return;
    }

    try {
      // Test by making a minimal chat completion request
      // If key is not provided, we can't test client-side — inform user
      if (!key) {
        setTestStatus("error");
        setTestMessage("Enter your API key to test the connection");
        setTesting(false);
        return;
      }

      const res = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: "Reply with OK" }],
          max_tokens: 5,
        }),
      });

      if (res.ok) {
        setTestStatus("success");
        setTestMessage("Connection successful");
      } else {
        const err = await res.text();
        setTestStatus("error");
        setTestMessage(`Error ${res.status}: ${err.slice(0, 100)}`);
      }
    } catch (e) {
      setTestStatus("error");
      setTestMessage(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setTesting(false);
      setTimeout(() => {
        setTestStatus("idle");
        setTestMessage("");
      }, 4000);
    }
  };

  return (
    <div className="space-y-3">
      {/* Tier toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Translation:</span>
        <div className="flex rounded-md border border-border text-xs overflow-hidden">
          <button
            className={`px-3 py-1.5 transition-colors ${
              tier === "free" ? "bg-muted font-medium" : "hover:bg-muted/50"
            }`}
            onClick={() => handleTierChange("free")}
          >
            Free (GT)
          </button>
          <button
            className={`px-3 py-1.5 transition-colors ${
              tier === "premium" ? "bg-muted font-medium" : "hover:bg-muted/50"
            } ${!isAuthenticated ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={() => {
              if (isAuthenticated) handleTierChange("premium");
            }}
            title={!isAuthenticated ? "Sign in to use Dao AI" : undefined}
          >
            Dao AI
          </button>
          <button
            className={`px-3 py-1.5 transition-colors ${
              tier === "byok" ? "bg-muted font-medium" : "hover:bg-muted/50"
            } ${!isAuthenticated ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={() => {
              if (isAuthenticated) handleTierChange("byok");
            }}
            title={!isAuthenticated ? "Sign in to use BYOK" : undefined}
          >
            BYOK
          </button>
        </div>
      </div>

      {/* BYOK configuration */}
      {tier === "byok" && isAuthenticated && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
            BYOK Settings
            {hasByokKey && (
              <span className="text-green-500 text-[10px]">configured</span>
            )}
          </button>

          {expanded && (
            <div className="space-y-3 pl-1 border-l-2 border-border ml-1.5 pl-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Endpoint URL</Label>
                <Input
                  value={byokEndpoint}
                  onChange={(e) => setByokEndpoint(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Model</Label>
                <Input
                  value={byokModel}
                  onChange={(e) => setByokModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  API Key{" "}
                  {hasByokKey && (
                    <span className="text-muted-foreground font-normal">(saved)</span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={byokKey}
                  onChange={(e) => setByokKey(e.target.value)}
                  placeholder={hasByokKey ? "••••••••" : "sk-..."}
                  className="h-8 text-sm"
                />
              </div>

              {/* Test + Save buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="text-xs"
                >
                  {testing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : testStatus === "success" ? (
                    <Check className="size-3 text-green-500" />
                  ) : testStatus === "error" ? (
                    <AlertCircle className="size-3 text-destructive" />
                  ) : null}
                  Test
                </Button>

                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs"
                >
                  {saving ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : saveStatus === "success" ? (
                    <Check className="size-3" />
                  ) : null}
                  Save
                </Button>

                {testMessage && (
                  <span
                    className={`text-xs ${
                      testStatus === "success"
                        ? "text-green-500"
                        : "text-destructive"
                    }`}
                  >
                    {testMessage}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tier === "byok" && !isAuthenticated && (
        <p className="text-xs text-muted-foreground">
          Sign in to configure your own API key for AI translation.
        </p>
      )}
    </div>
  );
}
