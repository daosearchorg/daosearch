"""
Google Translate client — free translation via translate.googleapis.com.
Async httpx-based, with proxy rotation via Redis proxy pool.

Used for:
- Translating search result titles/snippets
- Chapter content translation (future)
"""

from __future__ import annotations

import asyncio
import logging
import re

import httpx

from scraper.proxy import get_random_proxy, format_for_httpx

logger = logging.getLogger(__name__)

GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"

_CHINESE_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
_CJK_PUNCTUATION_RE = re.compile(r"[\u3000-\u303f\u30fb\ufe30-\ufe4f\u4e36]")

# Title case exceptions
_TITLE_LOWER = {
    "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
    "in", "on", "at", "to", "by", "of", "up", "as", "is", "it",
    "from", "with", "into", "over", "after", "under", "between",
}


def has_chinese(text: str) -> bool:
    """Check if text contains Chinese characters."""
    return bool(_CHINESE_RE.search(text))


def title_case(text: str) -> str:
    """Smart title case: capitalize words except articles/prepositions (unless first/last)."""
    words = text.split()
    if not words:
        return text
    result = []
    for i, w in enumerate(words):
        if i == 0 or i == len(words) - 1:
            result.append(w.capitalize())
        elif w.lower() in _TITLE_LOWER:
            result.append(w.lower())
        else:
            result.append(w.capitalize())
    return " ".join(result)


def _clean(text: str) -> str:
    """Clean translated text — normalize escapes, punctuation, spacing."""
    if not text:
        return text
    text = text.replace("\\N", "\n").replace("\\n", "\n").replace("\\R", "\n").replace("\\r", "\n")
    text = _CJK_PUNCTUATION_RE.sub("", text)
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"([.!?,;:])([A-Za-z])", r"\1 \2", text)
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    return text.strip()


def _get_proxy_url() -> str | None:
    """Get a formatted proxy URL from Redis, or None."""
    proxy_str = get_random_proxy()
    if proxy_str:
        try:
            return format_for_httpx(proxy_str)
        except ValueError:
            return None
    return None


async def translate_text(
    text: str,
    source: str = "zh",
    target: str = "en",
    retries: int = 3,
) -> str:
    """Translate a single text string. Returns translated text or original on failure."""
    if not text or not text.strip():
        return text
    if not has_chinese(text):
        return text

    clean_text = text.replace("\r", "").replace("\n", " ").strip()
    proxy_url = _get_proxy_url()
    use_post = len(clean_text.encode("utf-8")) > 600

    last_error = None
    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=10, proxy=proxy_url) as client:
                params = {"client": "gtx", "sl": source, "tl": target, "dt": "t"}
                if use_post:
                    resp = await client.post(
                        GOOGLE_TRANSLATE_URL, params=params, data={"q": clean_text}
                    )
                else:
                    params["q"] = clean_text
                    resp = await client.get(GOOGLE_TRANSLATE_URL, params=params)
                resp.raise_for_status()
                result = resp.json()
                translated = "".join(seg[0] for seg in result[0] if seg[0])
                translated = _clean(translated)

                # Retry with different proxy if Chinese remains
                if has_chinese(translated) and attempt < retries - 1:
                    proxy_url = _get_proxy_url()
                    continue

                return translated
        except Exception as e:
            last_error = e
            if attempt < retries - 1:
                await asyncio.sleep(0.3 * (attempt + 1))
                proxy_url = _get_proxy_url()

    logger.warning(f"Translation failed after {retries} attempts: {last_error}")
    return text


async def translate_batch(
    texts: list[str],
    source: str = "zh",
    target: str = "en",
    retries: int = 3,
) -> list[str]:
    """Translate multiple texts in a single API call.

    Joins texts with newline delimiter, sends one request, splits back.
    Falls back to originals on failure.
    """
    if not texts:
        return []

    # Track which indices actually need translation
    needs_translation: list[int] = []
    for i, t in enumerate(texts):
        if t and t.strip() and has_chinese(t):
            needs_translation.append(i)

    if not needs_translation:
        return list(texts)

    # Use \n as delimiter — Google Translate preserves line breaks
    # Strip \r and other control chars from individual texts
    to_translate = [texts[i].replace("\r", "").replace("\n", " ").strip() for i in needs_translation]
    joined = "\n".join(to_translate)

    proxy_url = _get_proxy_url()
    # Always POST for batch — joined text contains \n delimiters that break GET URLs
    use_post = True

    last_error = None
    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=15, proxy=proxy_url) as client:
                params = {"client": "gtx", "sl": source, "tl": target, "dt": "t"}
                if use_post:
                    resp = await client.post(
                        GOOGLE_TRANSLATE_URL, params=params, data={"q": joined}
                    )
                else:
                    params["q"] = joined
                    resp = await client.get(GOOGLE_TRANSLATE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()

                # Reassemble full translated text from segments
                full = "".join(seg[0] for seg in data[0] if seg[0])
                full = _clean(full)

                # Split back on newlines
                parts = full.split("\n")

                # Map back to results
                result = list(texts)
                for j, idx in enumerate(needs_translation):
                    if j < len(parts):
                        result[idx] = parts[j].strip()

                return result

        except Exception as e:
            last_error = e
            if attempt < retries - 1:
                await asyncio.sleep(0.3 * (attempt + 1))
                proxy_url = _get_proxy_url()

    logger.warning(f"Batch translation failed after {retries} attempts: {last_error}")
    return list(texts)
