import { auth } from "@/auth";
import { db } from "@/db";
import { userTranslationSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function decryptByokKey(ciphertext: string, ivHex: string): Promise<string | null> {
  const encryptionKey = process.env.BYOK_ENCRYPTION_KEY;
  if (!encryptionKey) return null;

  try {
    const { createDecipheriv } = await import("crypto");
    const key = Buffer.from(encryptionKey, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const data = Buffer.from(ciphertext, "base64");

    const authTag = data.subarray(data.length - 16);
    const encrypted = data.subarray(0, data.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

const READER_URL = process.env.READER_SERVICE_URL || "http://localhost:8000";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const { bookId, paragraphs: inputParagraphs, title, tier, stream: streamRequested } = body;
  const wantStream = streamRequested !== false;

  if (!Array.isArray(inputParagraphs) || inputParagraphs.length === 0) {
    return new Response("paragraphs are required", { status: 400 });
  }

  // Load user's translation settings
  let settings: typeof userTranslationSettings.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(userTranslationSettings)
      .where(eq(userTranslationSettings.userId, session.user.dbId))
      .limit(1);
    settings = rows[0];
  } catch {
    // Continue without settings
  }

  const effectiveTier = tier || settings?.tier || "free";

  if (effectiveTier !== "premium" && effectiveTier !== "byok") {
    return new Response("Invalid tier. Use premium or byok.", { status: 400 });
  }

  // Build headers for the Python reader service
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-user-id": String(session.user.dbId),
  };

  let translateMode = "ai"; // default for premium (Gemini)

  if (effectiveTier === "byok") {
    // Decrypt BYOK key and pass to reader service via headers
    if (!settings?.byokKeyEnc || !settings?.byokKeyIv) {
      return new Response("No BYOK key configured", { status: 400 });
    }
    const apiKey = await decryptByokKey(settings.byokKeyEnc, settings.byokKeyIv);
    if (!apiKey) {
      return new Response("Failed to decrypt API key", { status: 500 });
    }
    headers["x-byok-key"] = apiKey;
    headers["x-byok-endpoint"] = settings.byokEndpoint || "https://api.openai.com/v1";
    headers["x-byok-model"] = settings.byokModel || "gpt-4o-mini";
    translateMode = "byok";
  }

  // Proxy to Python reader service
  const readerEndpoint = wantStream ? "/translate/stream" : "/translate";
  const readerRes = await fetch(`${READER_URL}${readerEndpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: inputParagraphs.join("\n"),
      book_id: bookId || null,
      translate: translateMode,
      custom_instructions: settings?.customInstructions || null,
      title: title || null,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!readerRes.ok) {
    const errText = await readerRes.text().catch(() => "");
    return new Response(`Translation service error: ${errText}`, { status: 502 });
  }

  if (wantStream) {
    return new Response(readerRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming: return JSON directly
  const data = await readerRes.json();
  return NextResponse.json(data);
}
