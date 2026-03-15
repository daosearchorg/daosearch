"""Full AI translation pipeline with granular streaming.

Flow:
1. Load existing entities from DB
2. Stream entity detection — LLM streams JSON, we parse and yield each entity as it appears
3. Pre-inject all entities into content
4. Stream chunk translations — each chunk streams tokens as they arrive from the LLM
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import AsyncIterator

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from translation.entities import (
    EntityMap,
    Entity,
    load_entities,
    pre_inject,
    cleanup,
    save_new_entities,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

TRANSLATION_SYSTEM_PROMPT = """\
You are a professional Chinese-to-English webnovel translator. Output must read like native English prose, not a translation.

RULES:
- Restructure sentences for natural English. Avoid translationese and repetitive patterns.
- Match tone: punchy for action, flowing for emotion, clear for exposition.
- Translate idioms by meaning, not literally. Keep cultivation terms (dantian, qi) and units (li, liang).
- Preserve paragraph structure exactly. Do not add notes or commentary. Remove chapter numbers and watermarks.
- <<Name|G>> are pre-translated entities with gender (M/F/N). Output without markers. Use gender for pronouns (M=he, F=she).

FORMATTING (markdown):
- *Italics* for internal thoughts, memories. **Bold** for impacts, sound effects.
- Scene breaks: three dots on own line (...) with blank lines around.
- "Double quotes" for spoken dialogue. Only format when source text calls for it."""


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChunkTranslationResponse(BaseModel):
    translated_text: str


class DetectedEntity(BaseModel):
    original_name: str
    translated_name: str
    gender: str = "N"


class EntityDetectionResponse(BaseModel):
    entities: list[DetectedEntity]


ENTITY_DETECTION_PROMPT = """\
You are analyzing Chinese webnovel text. Extract ALL named entities (characters, locations, organizations, skills, items, cultivation terms, titles/ranks).

For each entity, provide:
- original_name: the Chinese name exactly as it appears
- translated_name: English translation/transliteration
- gender: M (male character), F (female character), N (neutral/non-person)

SKIP: common nouns, pronouns, numbers, generic phrases, real-world terms.

Return JSON: {"entities": [{"original_name": "...", "translated_name": "...", "gender": "N"}, ...]}

TEXT (first 6000 chars):
"""


# ---------------------------------------------------------------------------
# Chunk splitting
# ---------------------------------------------------------------------------

def split_into_chunks(paragraphs: list[str], chunk_size: int = 20) -> list[list[str]]:
    """Split paragraphs into chunks. Returns list of paragraph lists."""
    if len(paragraphs) <= chunk_size:
        return [paragraphs]

    chunks: list[list[str]] = []
    for i in range(0, len(paragraphs), chunk_size):
        chunks.append(paragraphs[i:i + chunk_size])

    # Merge tiny last chunk
    if len(chunks) > 1 and len(chunks[-1]) < 5:
        chunks[-2].extend(chunks.pop())

    return chunks


# ---------------------------------------------------------------------------
# SSE event
# ---------------------------------------------------------------------------

class TranslationEvent:
    def __init__(self, event: str, data: str):
        self.event = event
        self.data = data


# ---------------------------------------------------------------------------
# Main streaming pipeline
# ---------------------------------------------------------------------------

async def translate_chapter_stream(
    llm,
    raw_content: str,
    *,
    session: AsyncSession | None = None,
    book_id: int | None = None,
    user_id: int | None = None,
    model: str = "gemini-2.5-flash-lite",
    custom_instructions: str | None = None,
) -> AsyncIterator[TranslationEvent]:
    """Full translation pipeline with granular streaming.

    1. Load existing entities
    2. Stream entity detection (entities yielded one by one for highlighting)
    3. Pre-inject entities
    4. Stream each chunk translation token by token
    """
    paragraphs = [p.strip() for p in raw_content.split("\n") if p.strip()]
    total = len(paragraphs)

    yield TranslationEvent("status", f"Preparing translation ({total} paragraphs)...")

    # 1. Load existing entities from DB
    entity_map = EntityMap()
    if session and book_id:
        try:
            entity_map = await load_entities(session, book_id, user_id)
            if entity_map.entities:
                # Send all known entities to frontend
                for orig, ent in entity_map.entities.items():
                    yield TranslationEvent("entity", json.dumps({
                        "original": ent.original_name,
                        "translated": ent.translated_name,
                        "gender": ent.gender,
                        "source": "db",
                    }))
                yield TranslationEvent("status", f"Found {len(entity_map.entities)} entities. Detecting new...")
        except Exception as e:
            logger.warning(f"Failed to load entities: {e}")

    # 2. Stream entity detection — parse entities as LLM generates them
    from config import settings as _settings
    if session and book_id:
        try:
            entity_model = _settings.entity_model
            first_chunk = raw_content[:6000]
            prompt = ENTITY_DETECTION_PROMPT + first_chunk

            yield TranslationEvent("status", "Detecting new entities...")

            # Stream entity detection — parse entities from partial JSON as LLM generates
            full_response = ""
            seen_originals: set[str] = set(entity_map.entities.keys())
            new_entities_to_save: list[dict] = []

            async for token in llm.stream(
                model=entity_model,
                user_prompt=prompt,
                temperature=0.3,
                max_tokens=4000,
            ):
                full_response += token

                # Try to extract complete entity objects from the partial JSON
                new_found = _extract_streaming_entities(full_response, seen_originals)
                for ent_data in new_found:
                    original = ent_data["original_name"]
                    seen_originals.add(original)
                    entity_map.add(Entity(
                        original_name=original,
                        translated_name=ent_data["translated_name"],
                        gender=ent_data.get("gender", "N"),
                    ))
                    new_entities_to_save.append(ent_data)
                    yield TranslationEvent("entity", json.dumps({
                        "original": original,
                        "translated": ent_data["translated_name"],
                        "gender": ent_data.get("gender", "N"),
                        "source": "ai",
                    }))
                    yield TranslationEvent("status", f"Found {len(entity_map.entities)} entities...")
                    await asyncio.sleep(0)

            # Save new entities to DB
            if new_entities_to_save:
                await save_new_entities(session, book_id, new_entities_to_save)

        except Exception as e:
            logger.debug(f"Entity detection failed: {e}")

    yield TranslationEvent("status", f"Entities ready ({len(entity_map.entities)} total). Translating...")

    # 3. Pre-inject entities into content and split into chunks
    chunk_size = _settings.translation_chunk_size
    chunk_paras = split_into_chunks(paragraphs, chunk_size)
    num_chunks = len(chunk_paras)

    injected_chunks: list[str] = []
    for cp in chunk_paras:
        chunk_text = "\n\n".join(cp)
        if entity_map.entities:
            chunk_text = pre_inject(chunk_text, entity_map)
        injected_chunks.append(chunk_text)

    # Build system prompt
    system_prompt = TRANSLATION_SYSTEM_PROMPT
    if custom_instructions:
        system_prompt += f"\n\nADDITIONAL USER INSTRUCTIONS:\n{custom_instructions}"

    # 4. Stream chunk translations concurrently
    # Each chunk streams tokens independently via SSE
    MAX_CONCURRENT = 5
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    queue: asyncio.Queue[TranslationEvent | None] = asyncio.Queue()

    async def translate_chunk_streaming(idx: int, chunk: str):
        """Translate a single chunk, streaming tokens to the queue."""
        async with semaphore:
            para_offset = sum(len(cp) for cp in chunk_paras[:idx])

            try:
                prompt = f"Translate the following Chinese text to English.\n\n{chunk}"
                full_text = ""

                async for token in llm.stream(
                    model=model,
                    user_prompt=prompt,
                    system_prompt=system_prompt,
                    temperature=0.5,
                    max_tokens=8000,
                ):
                    full_text += token
                    await queue.put(TranslationEvent("token", json.dumps({
                        "chunk_idx": idx,
                        "token": token,
                    })))

                # Post-process the full translated text
                cleaned = cleanup(full_text)
                translated_paras = [p.strip() for p in cleaned.split("\n") if p.strip()]
                original_paras = chunk_paras[idx]

                # Send final chunk data with paragraph mapping
                chunk_data = []
                for j in range(max(len(translated_paras), len(original_paras))):
                    global_idx = para_offset + j
                    text = translated_paras[j] if j < len(translated_paras) else ""
                    original = original_paras[j] if j < len(original_paras) else ""
                    chunk_data.append({"index": global_idx, "text": text, "original": original})

                await queue.put(TranslationEvent("chunk_done", json.dumps({
                    "chunk_idx": idx,
                    "start": para_offset,
                    "end": para_offset + len(chunk_data) - 1,
                    "paragraphs": chunk_data,
                })))

            except Exception as e:
                logger.error(f"Chunk {idx} failed: {e}")
                await queue.put(TranslationEvent("chunk_error", json.dumps({
                    "chunk_idx": idx,
                    "error": str(e),
                })))

    # Launch all chunk translations
    tasks = [asyncio.create_task(translate_chunk_streaming(i, c)) for i, c in enumerate(injected_chunks)]

    # Signal when all tasks complete
    async def signal_done():
        await asyncio.gather(*tasks, return_exceptions=True)
        await queue.put(None)  # sentinel

    asyncio.create_task(signal_done())

    # Yield events as they arrive from the queue
    chunks_done = 0
    while True:
        event = await queue.get()
        if event is None:
            break
        yield event
        if event.event == "chunk_done":
            chunks_done += 1
            yield TranslationEvent("status", f"Translated {chunks_done}/{num_chunks} chunks...")

    yield TranslationEvent("done", json.dumps({"total": total, "chunks": num_chunks}))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Regex to find complete entity JSON objects regardless of field order
_ENTITY_BLOCK_RE = re.compile(r'\{[^{}]*"original_name"\s*:\s*"[^"]+?"[^{}]*\}')
_FIELD_RE = {
    "original_name": re.compile(r'"original_name"\s*:\s*"([^"]+)"'),
    "translated_name": re.compile(r'"translated_name"\s*:\s*"([^"]+)"'),
    "gender": re.compile(r'"gender"\s*:\s*"([MFN])"'),
}


def _extract_streaming_entities(partial_json: str, seen: set[str]) -> list[dict]:
    """Extract complete entity objects from a partially streamed JSON response."""
    found = []
    for block_match in _ENTITY_BLOCK_RE.finditer(partial_json):
        block = block_match.group(0)
        orig_m = _FIELD_RE["original_name"].search(block)
        trans_m = _FIELD_RE["translated_name"].search(block)
        if not orig_m or not trans_m:
            continue
        original = orig_m.group(1).strip()
        if not original or original in seen:
            continue
        gender_m = _FIELD_RE["gender"].search(block)
        found.append({
            "original_name": original,
            "translated_name": trans_m.group(1).strip(),
            "gender": gender_m.group(1) if gender_m else "N",
        })
    return found
