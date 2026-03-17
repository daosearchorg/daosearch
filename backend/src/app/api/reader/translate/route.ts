import { auth } from "@/auth";
import { db } from "@/db";
import { userTranslationSettings, userNovelEntities, translatedChapters } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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
    "Preserve paragraph breaks. Each input paragraph should map to exactly one output paragraph.";

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

// Split text into chunks of roughly maxChars characters, splitting on paragraph boundaries
function chunkParagraphs(paragraphs: string[], maxChars: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const p of paragraphs) {
    if (currentLen + p.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(p);
    currentLen += p.length;
  }
  if (current.length > 0) chunks.push(current);
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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const { bookId, chapterSeq, paragraphs: inputParagraphs, sourceDomain, title } = body;

  if (!bookId || !Array.isArray(inputParagraphs) || inputParagraphs.length === 0) {
    return new Response("bookId and paragraphs are required", { status: 400 });
  }

  // Load user's translation settings
  const [settings] = await db
    .select()
    .from(userTranslationSettings)
    .where(eq(userTranslationSettings.userId, session.user.dbId))
    .limit(1);

  if (!settings || !settings.byokKeyEnc || !settings.byokKeyIv) {
    return new Response("No BYOK key configured", { status: 400 });
  }

  const apiKey = await decryptByokKey(settings.byokKeyEnc, settings.byokKeyIv);
  if (!apiKey) {
    return new Response("Failed to decrypt API key", { status: 500 });
  }

  const endpoint = settings.byokEndpoint || "https://api.openai.com/v1";
  const model = settings.byokModel || "gpt-4o-mini";

  // Load user's entities for context
  const existingEntities = await db
    .select({
      sourceTerm: userNovelEntities.sourceTerm,
      translatedTerm: userNovelEntities.translatedTerm,
      gender: userNovelEntities.gender,
    })
    .from(userNovelEntities)
    .where(
      and(
        eq(userNovelEntities.userId, session.user.dbId),
        eq(userNovelEntities.bookId, Number(bookId)),
      ),
    );

  const entityContext = buildEntityContext(existingEntities);

  // Chunk paragraphs
  const chunks = chunkParagraphs(inputParagraphs, 6000);
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

        // After all chunks done: save new entities to user's glossary
        const newEntities = allDetectedEntities.filter(
          (e) => !existingEntities.some((ex) => ex.sourceTerm === e.original),
        );
        if (newEntities.length > 0) {
          for (const ent of newEntities) {
            await db
              .insert(userNovelEntities)
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
                  userNovelEntities.userId,
                  userNovelEntities.bookId,
                  userNovelEntities.sourceTerm,
                ],
                set: {
                  translatedTerm: ent.translated,
                  gender: ent.gender || "N",
                  updatedAt: new Date(),
                },
              });
          }
        }

        // Cache the full translation
        if (chapterSeq != null) {
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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
