import { auth } from "@/auth";
import { db } from "@/db";
import { userTranslationSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings] = await db
    .select({
      tier: userTranslationSettings.tier,
      byokEndpoint: userTranslationSettings.byokEndpoint,
      byokModel: userTranslationSettings.byokModel,
      customInstructions: userTranslationSettings.customInstructions,
      hasByokKey: userTranslationSettings.byokKeyEnc,
    })
    .from(userTranslationSettings)
    .where(eq(userTranslationSettings.userId, session.user.dbId))
    .limit(1);

  return NextResponse.json({
    tier: settings?.tier || "free",
    byokEndpoint: settings?.byokEndpoint || "",
    byokModel: settings?.byokModel || "",
    customInstructions: settings?.customInstructions || "",
    hasByokKey: !!settings?.hasByokKey,
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { tier, byokEndpoint, byokModel, byokKey, customInstructions } = body;

  if (!["free", "premium", "byok"].includes(tier)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const values: Record<string, unknown> = {
    userId: session.user.dbId,
    tier,
    byokEndpoint: byokEndpoint || null,
    byokModel: byokModel || null,
    customInstructions: customInstructions || null,
    updatedAt: new Date(),
  };

  // Encrypt BYOK key if provided
  if (byokKey) {
    const encrypted = await encryptByokKey(byokKey);
    if (encrypted) {
      values.byokKeyEnc = encrypted.ciphertext;
      values.byokKeyIv = encrypted.iv;
    }
  }

  await db
    .insert(userTranslationSettings)
    .values({ ...values, createdAt: new Date() } as typeof userTranslationSettings.$inferInsert)
    .onConflictDoUpdate({
      target: userTranslationSettings.userId,
      set: values,
    });

  return NextResponse.json({ ok: true });
}

async function encryptByokKey(plaintext: string): Promise<{ ciphertext: string; iv: string } | null> {
  const encryptionKey = process.env.BYOK_ENCRYPTION_KEY;
  if (!encryptionKey) return null;

  try {
    const { createCipheriv, randomBytes } = await import("crypto");
    const key = Buffer.from(encryptionKey, "hex");
    const iv = randomBytes(12);

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: Buffer.concat([encrypted, authTag]).toString("base64"),
      iv: iv.toString("hex"),
    };
  } catch {
    return null;
  }
}
