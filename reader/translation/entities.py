"""Entity management — loading, Aho-Corasick detection, pre-injection, post-processing.

Adapted from draftwork/scraperandtranslatorreference/src/workers/translation/core/
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class Entity:
    original_name: str
    translated_name: str
    gender: str = "N"  # M, F, N
    is_hidden: bool = False


@dataclass
class EntityMap:
    """Merged entity map for a specific user + novel."""
    entities: dict[str, Entity] = field(default_factory=dict)  # keyed by original_name

    def add(self, entity: Entity) -> None:
        if not entity.is_hidden:
            self.entities[entity.original_name] = entity

    def get(self, original: str) -> Entity | None:
        return self.entities.get(original)


async def load_entities(
    session: AsyncSession,
    book_id: int,
    user_id: int | None = None,
) -> EntityMap:
    """Load merged entity map: novel entities + user general entities + user overrides.

    Priority: user overrides > user general > novel entities
    """
    from sqlalchemy import text

    entity_map = EntityMap()

    # 1. Load novel entities
    rows = await session.execute(
        text("""
            SELECT original_name, translated_name, gender, is_hidden
            FROM novel_entities
            WHERE book_id = :book_id
        """),
        {"book_id": book_id},
    )
    for row in rows:
        entity_map.add(Entity(
            original_name=row.original_name,
            translated_name=row.translated_name,
            gender=row.gender or "N",
            is_hidden=row.is_hidden,
        ))

    if not user_id:
        return entity_map

    # 2. Load user general entities (override/add to map)
    rows = await session.execute(
        text("""
            SELECT original_name, translated_name, gender
            FROM user_general_entities
            WHERE user_id = :user_id
        """),
        {"user_id": user_id},
    )
    for row in rows:
        entity_map.add(Entity(
            original_name=row.original_name,
            translated_name=row.translated_name,
            gender=row.gender or "N",
        ))

    # 3. Load user overrides for this novel's entities
    rows = await session.execute(
        text("""
            SELECT ne.original_name, ueo.custom_name, ne.gender, ueo.is_hidden
            FROM user_entity_overrides ueo
            JOIN novel_entities ne ON ne.id = ueo.novel_entity_id
            WHERE ueo.user_id = :user_id AND ne.book_id = :book_id
        """),
        {"user_id": user_id, "book_id": book_id},
    )
    for row in rows:
        entity_map.add(Entity(
            original_name=row.original_name,
            translated_name=row.custom_name,
            gender=row.gender or "N",
            is_hidden=row.is_hidden,
        ))

    return entity_map


# ---------------------------------------------------------------------------
# Aho-Corasick detection + pre-injection
# ---------------------------------------------------------------------------

try:
    import ahocorasick
    HAS_AC = True
except ImportError:
    HAS_AC = False
    logger.warning("ahocorasick not installed — entity detection will use fallback")


def build_automaton(entity_map: EntityMap):
    """Build an Aho-Corasick automaton from entity map."""
    if not HAS_AC or not entity_map.entities:
        return None
    A = ahocorasick.Automaton()
    for original, entity in entity_map.entities.items():
        A.add_word(original, entity)
    A.make_automaton()
    return A


@dataclass
class Match:
    start: int
    end: int
    entity: Entity


def detect_entities(text: str, automaton) -> list[Match]:
    """Detect entities in text using Aho-Corasick. Returns non-overlapping longest matches."""
    if not automaton:
        return []

    raw_matches: list[Match] = []
    for end_idx, entity in automaton.iter(text):
        start_idx = end_idx - len(entity.original_name) + 1
        raw_matches.append(Match(start=start_idx, end=end_idx + 1, entity=entity))

    # Filter overlapping — longest match wins
    raw_matches.sort(key=lambda m: (m.start, -(m.end - m.start)))
    filtered: list[Match] = []
    last_end = -1
    for m in raw_matches:
        if m.start >= last_end:
            filtered.append(m)
            last_end = m.end

    return filtered


def pre_inject(text: str, entity_map: EntityMap) -> str:
    """Replace entity original names with <<TranslatedName|Gender>> markers.

    The LLM sees these markers and uses the translated name + gender for pronouns.
    Markers are stripped in post-processing.
    """
    automaton = build_automaton(entity_map)
    if not automaton:
        return text

    matches = detect_entities(text, automaton)
    if not matches:
        return text

    # Build result by replacing matches
    result = []
    last_end = 0
    for m in matches:
        result.append(text[last_end:m.start])
        result.append(f"<<{m.entity.translated_name}|{m.entity.gender}>>")
        last_end = m.end
    result.append(text[last_end:])

    return "".join(result)


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------

# CJK detection
_CJK_RE = re.compile(r"[\u2E80-\u2FFF\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]")

# Marker cleanup
_MARKER_RE = re.compile(r"<<([^|>]+)\|[MFN]>>")

# Chinese punctuation mapping
_PUNCT_MAP = str.maketrans({
    "\u3001": ",", "\u3002": ".", "\uff0c": ",", "\uff1a": ":",
    "\uff01": "!", "\uff1f": "?", "\u201c": '"', "\u201d": '"',
    "\u2018": "'", "\u2019": "'", "\u300a": '"', "\u300b": '"',
    "\u3008": "<", "\u3009": ">", "\uff08": "(", "\uff09": ")",
    "\u3010": "[", "\u3011": "]",
})


def has_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(text))


def cleanup(text: str) -> str:
    """Post-process translated text: strip markers, fix punctuation, normalize whitespace."""
    # Strip <<Name|G>> markers that leaked through
    text = _MARKER_RE.sub(r"\1", text)
    # Remove any remaining | gender tags
    text = re.sub(r"\|[MFN]>>", "", text)
    text = text.replace("<<", "").replace(">>", "")

    # Chinese punctuation → English
    text = text.translate(_PUNCT_MAP)

    # Normalize
    text = re.sub(r"\.{4,}", "...", text)
    text = re.sub(r",\s*\n", ", ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"## ?DONE ?##", "", text)

    return text.strip()


async def save_new_entities(
    session: AsyncSession,
    book_id: int,
    entities: list[dict],
) -> int:
    """Save AI-detected entities to novel_entities. Returns count of new entities."""
    from sqlalchemy import text as sql_text

    count = 0
    for e in entities:
        original = e.get("original_name", "").strip()
        translated = e.get("translated_name", "").strip()
        if not original or not translated:
            continue

        # Clean entity name
        original = re.sub(r"[^\w\u4e00-\u9fff\u3400-\u4dbf]", "", original).strip()
        if len(original) < 2:
            continue

        result = await session.execute(
            sql_text("""
                INSERT INTO novel_entities (book_id, original_name, translated_name, gender, created_at, updated_at)
                VALUES (:book_id, :original, :translated, :gender, NOW(), NOW())
                ON CONFLICT (book_id, original_name) DO NOTHING
                RETURNING id
            """),
            {
                "book_id": book_id,
                "original": original,
                "translated": translated,
                "gender": e.get("gender", "N"),
            },
        )
        if result.rowcount:
            count += 1

    await session.commit()
    return count
