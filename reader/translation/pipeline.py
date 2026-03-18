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
You are a professional Chinese-to-English webnovel translator. Write natural English prose.

RULES:
- Restructure for natural English. Match tone: punchy for action, flowing for emotion, clear for exposition.
- Translate idioms by meaning. Keep cultivation terms (dantian, qi) and units (li, liang).
- Preserve paragraph structure. Remove chapter numbers, watermarks, notes.
- <<Name|G>> are pre-translated entities (M/F/N). Output without markers. Use gender for pronouns.
- Proper nouns capitalized, common nouns lowercase.

FORMATTING:
- *Italics* for thoughts/memories. **Bold** for impacts/sound effects. "Double quotes" for dialogue.
- Game UI/system messages → ``` code fences (both multi-line and single-line).
- No trailing scene break dots (...)."""


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
Review and detect named entities in Chinese webnovel text (characters, places, skills, items, terms).

1. FILTER existing entities: only keep ones that actually appear in the text below. Drop irrelevant ones.
2. Do NOT change translations of kept existing entities.
3. Detect NEW entities not in the existing list.
4. Return the filtered + new list (only relevant entities).

Fields: original_name (Chinese as-is), translated_name (English, unchanged for existing), gender (M/F/N).
SKIP common nouns, pronouns, numbers, generic phrases.

Return JSON: {"entities": [{"original_name": "...", "translated_name": "...", "gender": "N"}, ...]}
"""

ENTITY_DETECTION_TEXT_HEADER = "\nTEXT:\n"


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
    title: str | None = None,
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

    # 1. Load existing entities from DB (used as context for LLM filtering, not sent to frontend yet)
    entity_map = EntityMap()
    if session and book_id:
        try:
            entity_map = await load_entities(session, book_id, user_id)
            if entity_map.entities:
                yield TranslationEvent("status", f"Loaded {len(entity_map.entities)} known entities...")
        except Exception as e:
            logger.warning(f"Failed to load entities: {e}")

    # 2. Stream entity detection — parse entities as LLM generates them
    from config import settings as _settings
    if session and book_id:
        try:
            entity_model = _settings.entity_model
            first_chunk = raw_content[:6000]

            # Build prompt with existing entity context for validation
            existing_section = ""
            if entity_map.entities:
                lines = []
                for orig, ent in entity_map.entities.items():
                    g = ent.gender if ent.gender in ("M", "F") else "N"
                    lines.append(f"  {orig} → {ent.translated_name} ({g})")
                existing_section = "\nEXISTING ENTITIES (keep relevant ones, drop irrelevant, keep translations unchanged):\n" + "\n".join(lines) + "\n"

            prompt = ENTITY_DETECTION_PROMPT + existing_section + ENTITY_DETECTION_TEXT_HEADER + first_chunk

            yield TranslationEvent("status", "Detecting entities...")

            # Stream entity detection — LLM returns filtered existing + new entities
            full_response = ""
            existing_originals = set(entity_map.entities.keys())
            seen_originals: set[str] = set()
            new_entities_to_save: list[dict] = []
            filtered_map = EntityMap()

            # For BYOK (OpenAIClient), use the user's model for entity detection too
            # since they may not have access to the Gemini entity model
            from translation.llm_client import OpenAIClient
            detect_model = model if isinstance(llm, OpenAIClient) else entity_model

            async for token in llm.stream(
                model=detect_model,
                user_prompt=prompt,
                temperature=0.3,
                max_tokens=4000,
            ):
                full_response += token

                new_found = _extract_streaming_entities(full_response, seen_originals)
                for ent_data in new_found:
                    original = ent_data["original_name"]
                    seen_originals.add(original)

                    is_existing = original in existing_originals
                    if is_existing:
                        # LLM kept this existing entity — use original translation
                        existing = entity_map.get(original)
                        if existing:
                            filtered_map.add(existing)
                    else:
                        # New entity detected by LLM
                        filtered_map.add(Entity(
                            original_name=original,
                            translated_name=ent_data["translated_name"],
                            gender=ent_data.get("gender", "N"),
                        ))
                        new_entities_to_save.append(ent_data)

                    yield TranslationEvent("entity", json.dumps({
                        "original": original,
                        "translated": (entity_map.get(original).translated_name if is_existing and entity_map.get(original) else ent_data["translated_name"]),
                        "gender": ent_data.get("gender", "N"),
                        "source": "db" if is_existing else "ai",
                    }))
                    await asyncio.sleep(0)

            # Replace entity map with filtered version (only relevant entities)
            entity_map = filtered_map

            # Save new entities to DB
            if new_entities_to_save:
                await save_new_entities(session, book_id, new_entities_to_save, user_id)

        except Exception as e:
            logger.debug(f"Entity detection failed: {e}")

    # 3. Translate title in background (runs concurrently with chunk prep)
    has_title = bool(title and title.strip())
    title_task = None
    if has_title:
        async def _translate_title():
            title_text = title.strip()
            title_prompt = f"Translate this Chinese chapter title to English. Return ONLY the translated title, nothing else.\n\n{title_text}"
            translated_title = ""
            async for token in llm.stream(
                model=model,
                user_prompt=title_prompt,
                system_prompt="You are a Chinese-to-English translator. Translate the chapter title naturally. Proper nouns capitalized, common nouns lowercase. Output only the translation.",
                temperature=0.3,
                max_tokens=200,
            ):
                translated_title += token
            return cleanup(translated_title).strip().strip('"').strip("'")
        title_task = asyncio.create_task(_translate_title())

    # 4. Pre-inject entities into content and split into chunks
    chunk_size = _settings.translation_chunk_size
    chunk_paras = split_into_chunks(paragraphs, chunk_size)
    num_chunks = len(chunk_paras)

    yield TranslationEvent("status", f"Translating... 0/{num_chunks} chunks")

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
    title_emitted = False
    while True:
        event = await queue.get()
        if event is None:
            break
        yield event
        if event.event == "chunk_done":
            chunks_done += 1
            yield TranslationEvent("status", f"Translating... {chunks_done}/{num_chunks} chunks")

        # Emit title as soon as it's ready (runs concurrently with chunks)
        if not title_emitted and title_task and title_task.done():
            try:
                translated_title = title_task.result()
                if translated_title:
                    yield TranslationEvent("title", translated_title)
            except Exception:
                pass
            title_emitted = True

    # If title wasn't emitted during chunk processing, emit now
    if not title_emitted and title_task:
        try:
            translated_title = await title_task
            if translated_title:
                yield TranslationEvent("title", translated_title)
        except Exception:
            pass

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
