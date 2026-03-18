import { auth } from "@/auth";
import { db } from "@/db";
import { userTranslationSettings, userBookEntities, translatedChapters } from "@/db/schema";
import { eq, and } from "drizzle-orm";
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

    // Last 16 bytes are the GCM auth tag
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

interface EntityForContext {
  original?: string;
  sourceTerm?: string;
  translated?: string;
  translatedTerm?: string;
  gender: string | null;
}

function buildEntityContext(entities: EntityForContext[]): string {
  if (entities.length === 0) return "";
  const lines = entities.map((e) => {
    const src = e.sourceTerm || e.original || "";
    const tgt = e.translatedTerm || e.translated || "";
    const g = e.gender === "M" ? "Male" : e.gender === "F" ? "Female" : "Neutral";
    return `${src} → ${tgt} (${g})`;
  });
  return `\n\nKnown character/term translations:\n${lines.join("\n")}`;
}

function buildSystemPrompt(
  isFirstChunk: boolean,
  entityContext: string,
  customInstructions: string | null,
): string {
  let prompt =
    "You are a professional Chinese-to-English web novel translator. " +
    "Translate the following Chinese web novel text into natural, fluent English. " +
    "Preserve paragraph breaks. Each input paragraph should map to exactly one output paragraph. " +
    "Adjust capitalization naturally: proper nouns and names stay capitalized, common nouns and objects stay lowercase.";

  if (isFirstChunk) {
    prompt +=
      "\n\nFor this first section, also detect character names and important terms. " +
      'At the very start of your response, list detected entities in this format (one per line):\n' +
      "<<ChineseName|Gender>> → TranslatedName\n" +
      "Gender should be M (male), F (female), or N (neutral/unknown).\n" +
      "After the entity list, add a line containing only '---' then provide the translation.\n" +
      "The first line of the translation should be the translated chapter title.";
  }

  if (entityContext) {
    prompt += entityContext;
  }

  if (customInstructions) {
    prompt += `\n\nAdditional instructions from user:\n${customInstructions}`;
  }

  return prompt;
}

// Split paragraphs into chunks of chunkSize paragraphs each
const CHUNK_SIZE = 25;

function chunkParagraphs(paragraphs: string[]): string[][] {
  if (paragraphs.length <= CHUNK_SIZE) return [paragraphs];
  const chunks: string[][] = [];
  for (let i = 0; i < paragraphs.length; i += CHUNK_SIZE) {
    chunks.push(paragraphs.slice(i, i + CHUNK_SIZE));
  }
  // Merge tiny last chunk
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 5) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1].push(...last);
  }
  return chunks;
}

interface ParsedFirstChunk {
  entities: { original: string; translated: string; gender: string }[];
  translatedTitle: string;
  paragraphs: string[];
}

function parseFirstChunkResponse(text: string): ParsedFirstChunk {
  const entities: { original: string; translated: string; gender: string }[] = [];
  let translatedTitle = "";

  // Split on --- separator
  const parts = text.split(/^---$/m);
  let entitySection = "";
  let translationSection = "";

  if (parts.length >= 2) {
    entitySection = parts[0].trim();
    translationSection = parts.slice(1).join("---").trim();
  } else {
    // No separator found — treat entire response as translation
    translationSection = text.trim();
  }

  // Parse entities from <<Name|G>> → Translation format
  if (entitySection) {
    const entityRegex = /<<(.+?)\|([MFN])>>\s*→\s*(.+)/g;
    let match;
    while ((match = entityRegex.exec(entitySection)) !== null) {
      entities.push({
        original: match[1].trim(),
        gender: match[2],
        translated: match[3].trim(),
      });
    }
  }

  // Parse translation paragraphs
  const lines = translationSection.split("\n").filter((l) => l.trim());
  if (lines.length > 0) {
    translatedTitle = lines[0].trim();
  }
  const paragraphs = lines.slice(1).map((l) => l.trim());

  return { entities, translatedTitle, paragraphs };
}

const READER_URL = process.env.READER_SERVICE_URL || "http://localhost:8000";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const { bookId, chapterSeq, paragraphs: inputParagraphs, sourceDomain, title, tier, stream: streamRequested } = body;
  const wantStream = streamRequested !== false; // default true, set false for prefetch

  if (!Array.isArray(inputParagraphs) || inputParagraphs.length === 0) {
    return new Response("paragraphs are required", { status: 400 });
  }

  // Load user's translation settings (needed by both premium and BYOK paths)
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

  // Determine tier: from body or from user settings
  const effectiveTier = tier || settings?.tier || "free";

  if (effectiveTier === "premium") {
    // Use streaming or non-streaming endpoint based on request
    const readerEndpoint = wantStream ? "/translate/stream" : "/translate";
    const readerRes = await fetch(`${READER_URL}${readerEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session.user.dbId ? { "x-user-id": String(session.user.dbId) } : {}),
      },
      body: JSON.stringify({
        content: inputParagraphs.join("\n"),
        book_id: bookId || null,
        translate: "ai",
        custom_instructions: settings?.customInstructions || null,
        title: title || null,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!readerRes.ok) {
      return new Response("Translation service error", { status: 502 });
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

    // Non-streaming: return JSON directly from Python service
    const data = await readerRes.json();
    return NextResponse.json(data);
  }

  // BYOK path
  if (!settings || !settings.byokKeyEnc || !settings.byokKeyIv) {
    return new Response("No BYOK key configured", { status: 400 });
  }

  const apiKey = await decryptByokKey(settings.byokKeyEnc, settings.byokKeyIv);
  if (!apiKey) {
    return new Response("Failed to decrypt API key", { status: 500 });
  }

  const endpoint = settings.byokEndpoint || "https://api.openai.com/v1";
  const model = settings.byokModel || "gpt-4o-mini";

  // Load user's entities for context (only if bookId is provided)
  const existingEntities = bookId
    ? await db
        .select({
          sourceTerm: userBookEntities.sourceTerm,
          translatedTerm: userBookEntities.translatedTerm,
          gender: userBookEntities.gender,
        })
        .from(userBookEntities)
        .where(
          and(
            eq(userBookEntities.userId, session.user.dbId),
            eq(userBookEntities.bookId, Number(bookId)),
          ),
        )
    : [];

  const entityContext = buildEntityContext(existingEntities);

  // Chunk paragraphs
  const chunks = chunkParagraphs(inputParagraphs);
  const allDetectedEntities: { original: string; translated: string; gender: string }[] = [
    ...existingEntities.map((e) => ({
      original: e.sourceTerm,
      translated: e.translatedTerm,
      gender: e.gender || "N",
    })),
  ];
  const allTranslatedParagraphs: string[] = new Array(inputParagraphs.length).fill("");
  let translatedTitle = "";

  // SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      try {
        let globalParaOffset = 0;

        for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
          const chunk = chunks[chunkIdx];
          const isFirst = chunkIdx === 0;

          // Build dynamic entity context for subsequent chunks
          const currentEntityContext =
            chunkIdx > 0 ? buildEntityContext(allDetectedEntities) : entityContext;

          const systemPrompt = buildSystemPrompt(
            isFirst,
            currentEntityContext,
            settings.customInstructions || null,
          );

          let userContent = chunk.join("\n\n");
          if (isFirst && title) {
            userContent = `Chapter title: ${title}\n\n${userContent}`;
          }

          // Call OpenAI-compatible API with streaming
          const chatUrl = endpoint.replace(/\/+$/, "") + "/chat/completions";
          const res = await fetch(chatUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
              ],
              stream: true,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            send("error", JSON.stringify({ message: `API error: ${res.status} - ${errText}` }));
            controller.close();
            return;
          }

          const reader = res.body?.getReader();
          if (!reader) {
            send("error", JSON.stringify({ message: "No response stream" }));
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let fullText = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const token = parsed.choices?.[0]?.delta?.content;
                if (token) {
                  fullText += token;
                  send(
                    "token",
                    JSON.stringify({ chunk_idx: chunkIdx, token }),
                  );
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }

          // Parse the completed chunk
          if (isFirst) {
            const parsed = parseFirstChunkResponse(fullText);
            translatedTitle = parsed.translatedTitle;

            // Emit translated title
            if (translatedTitle) {
              send("title", translatedTitle);
            }

            // Emit detected entities
            for (const ent of parsed.entities) {
              // Only add if not already known
              if (!allDetectedEntities.some((e) => e.original === ent.original)) {
                allDetectedEntities.push(ent);
                send(
                  "entity",
                  JSON.stringify({
                    original: ent.original,
                    translated: ent.translated,
                    gender: ent.gender,
                    source: "ai",
                  }),
                );
              }
            }

            // Map translated paragraphs
            const chunkParas = parsed.paragraphs;
            for (let j = 0; j < chunkParas.length && globalParaOffset + j < allTranslatedParagraphs.length; j++) {
              allTranslatedParagraphs[globalParaOffset + j] = chunkParas[j];
            }

            send(
              "chunk_done",
              JSON.stringify({
                chunk_idx: chunkIdx,
                paragraphs: chunkParas.map((text, j) => ({
                  index: globalParaOffset + j,
                  text,
                })),
              }),
            );
          } else {
            // Subsequent chunks: no entity detection, just paragraphs
            const chunkParas = fullText
              .split("\n")
              .filter((l) => l.trim())
              .map((l) => l.trim());

            for (let j = 0; j < chunkParas.length && globalParaOffset + j < allTranslatedParagraphs.length; j++) {
              allTranslatedParagraphs[globalParaOffset + j] = chunkParas[j];
            }

            send(
              "chunk_done",
              JSON.stringify({
                chunk_idx: chunkIdx,
                paragraphs: chunkParas.map((text, j) => ({
                  index: globalParaOffset + j,
                  text,
                })),
              }),
            );
          }

          globalParaOffset += chunk.length;
        }

        // After all chunks done: save new entities to user's glossary (only if bookId present)
        if (bookId) {
          const newEntities = allDetectedEntities.filter(
            (e) => !existingEntities.some((ex) => ex.sourceTerm === e.original),
          );
          if (newEntities.length > 0) {
            for (const ent of newEntities) {
              await db
                .insert(userBookEntities)
                .values({
                  userId: session.user.dbId,
                  bookId: Number(bookId),
                  sourceTerm: ent.original,
                  translatedTerm: ent.translated,
                  gender: ent.gender || "N",
                  category: "character",
                })
                .onConflictDoUpdate({
                  target: [
                    userBookEntities.userId,
                    userBookEntities.bookId,
                    userBookEntities.sourceTerm,
                  ],
                  set: {
                    translatedTerm: ent.translated,
                    gender: ent.gender || "N",
                    updatedAt: new Date(),
                  },
                });
            }
          }
        }

        // Cache the full translation (only if bookId present)
        if (bookId && chapterSeq != null) {
          const fullTranslation = allTranslatedParagraphs.join("\n");
          await db
            .insert(translatedChapters)
            .values({
              userId: session.user.dbId,
              bookId: Number(bookId),
              chapterSeq: Number(chapterSeq),
              translatedTitle: translatedTitle || null,
              translatedText: fullTranslation,
              sourceDomain: sourceDomain || null,
              translatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                translatedChapters.userId,
                translatedChapters.bookId,
                translatedChapters.chapterSeq,
              ],
              set: {
                translatedTitle: translatedTitle || null,
                translatedText: fullTranslation,
                sourceDomain: sourceDomain || null,
                translatedAt: new Date(),
              },
            });
        }

        send("done", JSON.stringify({ ok: true }));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        try {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`),
          );
        } catch { /* controller may be closed */ }
        controller.close();
      }
    },
  });

  if (!wantStream) {
    // Non-streaming: consume the stream, collect results, return JSON
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const collectedEntities: { original: string; translated: string; gender: string }[] = [];
    const collectedParagraphs: { index: number; text: string }[] = [];
    let collectedTitle = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const block of text.split("\n\n")) {
        const eventMatch = block.match(/^event: (\w+)/);
        const dataMatch = block.match(/^data: (.+)$/m);
        if (!eventMatch || !dataMatch) continue;
        const event = eventMatch[1];
        const data = dataMatch[1];
        if (event === "entity") {
          collectedEntities.push(JSON.parse(data));
        } else if (event === "chunk_done") {
          const chunk = JSON.parse(data);
          if (chunk.paragraphs) collectedParagraphs.push(...chunk.paragraphs);
        } else if (event === "title") {
          collectedTitle = data;
        }
      }
    }

    collectedParagraphs.sort((a, b) => a.index - b.index);
    return NextResponse.json({
      paragraphs: collectedParagraphs,
      entities: collectedEntities,
      title: collectedTitle,
    });
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
