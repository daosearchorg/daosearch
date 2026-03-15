import { auth } from "@/auth";
import { db } from "@/db";
import { userTranslationSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const READER_URL = process.env.READER_SERVICE_URL || "http://localhost:8000";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chapterUrl = url.searchParams.get("url");
  if (!chapterUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const translate = url.searchParams.get("translate") || "raw";
  const bookId = url.searchParams.get("book_id");
  const stream = url.searchParams.get("stream") === "1";

  // Build reader service URL
  const readerUrl = new URL("/chapter", READER_URL);
  readerUrl.searchParams.set("url", chapterUrl);
  readerUrl.searchParams.set("translate", translate);
  if (bookId) readerUrl.searchParams.set("book_id", bookId);
  if (stream) readerUrl.searchParams.set("stream", "true");

  // Build headers for reader service
  const headers: Record<string, string> = {
    "x-user-id": String(session.user.dbId),
  };

  // Load user translation settings for AI/BYOK
  if (translate === "ai" || translate === "byok") {
    try {
      const [settings] = await db
        .select()
        .from(userTranslationSettings)
        .where(eq(userTranslationSettings.userId, session.user.dbId))
        .limit(1);

      if (settings) {
        if (settings.customInstructions) {
          headers["x-custom-instructions"] = settings.customInstructions;
        }

        if (translate === "byok" && settings.byokKeyEnc && settings.byokKeyIv) {
          // Decrypt BYOK key
          const decryptedKey = await decryptByokKey(settings.byokKeyEnc, settings.byokKeyIv);
          if (decryptedKey) {
            headers["x-byok-key"] = decryptedKey;
            headers["x-byok-endpoint"] = settings.byokEndpoint || "https://api.openai.com/v1";
            headers["x-byok-model"] = settings.byokModel || "gpt-4o";
          }
        }
      }
    } catch (e) {
      // Continue without settings
    }
  }

  try {
    const res = await fetch(readerUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: text || "Failed to fetch chapter" }, { status: 502 });
    }

    // Stream SSE if requested
    if (stream && res.body) {
      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch chapter" },
      { status: 502 },
    );
  }
}

async function decryptByokKey(encryptedKey: string, ivHex: string): Promise<string | null> {
  const encryptionKey = process.env.BYOK_ENCRYPTION_KEY;
  if (!encryptionKey) return null;

  try {
    const { createDecipheriv } = await import("crypto");
    const key = Buffer.from(encryptionKey, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedKey, "base64");

    // AES-256-GCM: last 16 bytes are the auth tag
    const authTag = encrypted.subarray(encrypted.length - 16);
    const ciphertext = encrypted.subarray(0, encrypted.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
