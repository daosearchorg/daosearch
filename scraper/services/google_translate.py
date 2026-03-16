"""
Google Translate Client - Free translation service via googleapis.com
Replaces OpenAI for Chinese→English translation with proxy rotation.
"""

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional

import requests

from core.config import config
from services.proxy_manager import RedisProxyManager

logger = logging.getLogger(__name__)

GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"

_CHINESE_RE = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf]')
_PINYIN_RE = re.compile(r'[āǎīǐōǒūǔǖǘǚǜ]')
# CJK punctuation marks that Google Translate sometimes leaves behind (丶·〇々etc.)
# Includes U+4E36 (丶 dot) which is technically CJK unified ideograph but used as punctuation
_CJK_PUNCTUATION_RE = re.compile(r'[\u3000-\u303f\u30fb\ufe30-\ufe4f\u4e36]')
# Kaomoji/emoticon patterns that contain decorative CJK chars (e.g. (#`皿?), <怒>)
_KAOMOJI_RE = re.compile(
    r'[(\uff08][^)\uff09]{1,12}[)\uff09]'
    r'|<[^>]{1,12}>'
)

# Words that should stay lowercase in title case (articles, prepositions, conjunctions)
_TITLE_CASE_LOWER = {
    'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
    'in', 'on', 'at', 'to', 'by', 'of', 'up', 'as', 'is', 'it',
    'from', 'with', 'into', 'over', 'after', 'under', 'between',
}


def _title_case(text: str) -> str:
    """Smart title case: capitalize words except articles/prepositions.
    Handles emoji prefixes (skips non-alpha tokens), brackets, and parentheses."""
    if not text:
        return text
    words = text.split()
    if not words:
        return text

    _has_alpha = re.compile(r'[a-zA-Z]')
    found_first_alpha = False
    after_bracket = False
    result = []

    for i, word in enumerate(words):
        has_alpha = bool(_has_alpha.search(word))
        is_last = i == len(words) - 1

        if word and word[0] in '([':
            # Bracket/paren word: capitalize letter after bracket
            result.append(word[0] + word[1:].capitalize() if len(word) > 1 else word)
            if has_alpha:
                found_first_alpha = True
        elif is_last and has_alpha:
            # Last word: always capitalize
            result.append(word.capitalize())
        elif (not found_first_alpha and has_alpha) or after_bracket:
            # First alphabetic word or word right after closing bracket
            result.append(word.capitalize())
            if has_alpha:
                found_first_alpha = True
            after_bracket = False
        elif has_alpha and word.lower() in _TITLE_CASE_LOWER:
            result.append(word.lower())
        elif has_alpha:
            result.append(word.capitalize())
        else:
            # Non-alpha (emoji, numbers) — keep as-is
            result.append(word)

        if word and word[-1] in '])':
            after_bracket = True

    return ' '.join(result)


def _clean_title(text: str) -> str:
    """Post-process a translated title: strip quotes, trailing periods, apply title case."""
    if not text:
        return text
    # Strip surrounding quotes (straight and curly)
    text = text.strip()
    text = re.sub(r'^[""\u201c\u201d]+|[""\u201c\u201d]+$', '', text)
    text = re.sub(r"^['']+|['']+$", '', text)
    # Strip trailing period (titles shouldn't end with one)
    text = re.sub(r'\.\s*$', '', text)
    text = text.strip()
    # Apply title case
    text = _title_case(text)
    return text


def _sentence_case(text: str) -> str:
    """Ensure proper sentence capitalization: first letter and after periods."""
    if not text:
        return text
    # Capitalize first character
    text = text[0].upper() + text[1:] if len(text) > 1 else text.upper()
    # Capitalize after sentence-ending punctuation followed by space
    result = []
    capitalize_next = False
    for ch in text:
        if capitalize_next and ch.isalpha():
            result.append(ch.upper())
            capitalize_next = False
        else:
            result.append(ch)
        if ch in '.!?' and not capitalize_next:
            capitalize_next = True
        elif ch == ' ':
            pass  # keep capitalize_next state
        elif ch.isalpha():
            capitalize_next = False
    return ''.join(result)


def _clean_text(text: str) -> str:
    """Fix common Google Translate artifacts."""
    if not text:
        return text
    # Fix Google Translate \N/\R artifacts (literal backslash + letter used instead of newline)
    text = text.replace('\\N', '\n').replace('\\n', '\n').replace('\\R', '\n').replace('\\r', '\n')
    # Strip CJK punctuation marks (丶·〇 etc.) that Google Translate leaves behind
    text = _CJK_PUNCTUATION_RE.sub('', text)
    # Normalize multiple spaces
    text = re.sub(r' {2,}', ' ', text)
    # Add space after punctuation if missing (but not before closing brackets/parens)
    text = re.sub(r'([.!?,;:])([A-Za-z])', r'\1 \2', text)
    # Normalize quote styles to standard double quotes
    text = text.replace('\u201c', '"').replace('\u201d', '"')
    text = text.replace('\u2018', "'").replace('\u2019', "'")
    # Strip leading/trailing whitespace
    text = text.strip()
    return text


class GoogleTranslateClient:
    """
    Handles Google Translate API calls for translation with proxy rotation.
    Same public interface as OpenAIClient.
    """

    def __init__(self):
        gt_config = config.google_translate
        self.concurrency = gt_config['concurrency']
        self.timeout = gt_config['timeout']
        self.proxy_manager = RedisProxyManager()

    def _get_proxy_dict(self) -> Dict[str, str]:
        """Get a random proxy formatted for requests library."""
        proxy_string = self.proxy_manager.get_random_proxy()
        return self.proxy_manager.format_proxy_for_requests(proxy_string)

    def _translate_text(self, text: str, retries: int = 3) -> str:
        """Translate a single text via Google Translate API with retry.
        Preserves paragraph breaks by translating each line separately.
        If any Chinese remains in the result, retries the FULL text (not word-by-word) to preserve context.
        """
        if not text or not text.strip():
            return text

        # Normalize literal escape sequences to actual newlines
        text = text.replace('\\r\\n', '\n').replace('\\r', '\n').replace('\\n', '\n')
        text = text.replace('\r\n', '\n').replace('\r', '\n')

        # Split on newlines, translate non-empty paragraphs, preserve structure
        lines = text.split('\n')
        if len(lines) > 1:
            non_empty = [(i, line) for i, line in enumerate(lines) if line.strip()]
            if not non_empty:
                return text
            # Translate non-empty lines as a joined batch
            translated_lines = self._translate_joined_chunk(
                [line for _, line in non_empty]
            )
            # Retry any lines that still contain Chinese — retranslate the FULL line
            for j, t in enumerate(translated_lines):
                if t and self.has_chinese_characters(t):
                    orig_line = non_empty[j][1]
                    retried = self._retry_full_text(orig_line, max_retries=2)
                    if retried is not None:
                        translated_lines[j] = retried
            # Rebuild with original empty lines preserved
            result_lines = list(lines)
            for (orig_idx, _), translated in zip(non_empty, translated_lines):
                result_lines[orig_idx] = translated
            return '\n'.join(result_lines)

        result = self._translate_single(text, retries)
        # If single-line result still has Chinese, retry the full text
        if result and self.has_chinese_characters(result):
            retried = self._retry_full_text(text, max_retries=2)
            if retried is not None:
                return retried
        return result

    def _retry_full_text(self, text: str, max_retries: int = 2) -> Optional[str]:
        """Retry translating the full text (not word-by-word) with different proxies.
        Returns clean translation or None if all retries still contain Chinese.
        """
        for attempt in range(max_retries):
            try:
                result = self._translate_single(text)
                result = _clean_text(result)
                if not self.has_chinese_characters(result):
                    return result
                logger.debug(f"Full text retry {attempt + 1}/{max_retries} still has Chinese")
            except Exception as e:
                logger.debug(f"Full text retry {attempt + 1}/{max_retries} failed: {e}")
        return None

    def _translate_single(self, text: str, retries: int = 3) -> str:
        """Translate a single line of text via Google Translate API with retry.
        Uses POST for long texts to avoid 400 Bad Request from URL length limits.
        """
        last_error = None
        # Use POST if URL-encoded text would exceed ~1800 chars (safe limit for GET)
        use_post = len(text.encode('utf-8')) > 600
        for attempt in range(retries):
            try:
                proxy_dict = self._get_proxy_dict()
                params = {
                    "client": "gtx",
                    "sl": "zh",
                    "tl": "en",
                    "dt": "t",
                }
                if use_post:
                    resp = requests.post(
                        GOOGLE_TRANSLATE_URL,
                        params=params,
                        data={"q": text},
                        proxies=proxy_dict,
                        timeout=self.timeout,
                    )
                else:
                    params["q"] = text
                    resp = requests.get(
                        GOOGLE_TRANSLATE_URL,
                        params=params,
                        proxies=proxy_dict,
                        timeout=self.timeout,
                    )
                resp.raise_for_status()
                result = resp.json()
                # Response: [[["translated","original",...],...],null,"zh-CN"]
                return "".join(
                    segment[0] for segment in result[0] if segment[0]
                )
            except Exception as e:
                last_error = e
                if attempt < retries - 1:
                    time.sleep(0.5 * (attempt + 1))

        logger.error(f"Google Translate failed after {retries} attempts: {last_error}")
        raise last_error

    def _translate_batch(self, texts: List[str]) -> List[str]:
        """Translate multiple texts in parallel using ThreadPoolExecutor (one request per text)."""
        results = [None] * len(texts)

        with ThreadPoolExecutor(max_workers=min(self.concurrency, len(texts))) as executor:
            future_to_idx = {
                executor.submit(self._translate_text, text): idx
                for idx, text in enumerate(texts)
            }
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    results[idx] = future.result()
                except Exception as e:
                    logger.error(f"Batch translation failed for index {idx}: {e}")
                    results[idx] = ""

        return results

    def _translate_joined_chunk(self, texts: List[str], retries: int = 3) -> List[str]:
        """Translate multiple short texts in a single API call by joining with newlines."""
        # Replace empty texts with placeholder to maintain line alignment
        processed = [t.strip() if t and t.strip() else "---" for t in texts]
        joined = "\n".join(processed)

        last_error = None
        use_post = len(joined.encode('utf-8')) > 600
        for attempt in range(retries):
            try:
                proxy_dict = self._get_proxy_dict()
                params = {
                    "client": "gtx",
                    "sl": "zh",
                    "tl": "en",
                    "dt": "t",
                }
                if use_post:
                    resp = requests.post(
                        GOOGLE_TRANSLATE_URL,
                        params=params,
                        data={"q": joined},
                        proxies=proxy_dict,
                        timeout=self.timeout,
                    )
                else:
                    params["q"] = joined
                    resp = requests.get(
                        GOOGLE_TRANSLATE_URL,
                        params=params,
                        proxies=proxy_dict,
                        timeout=self.timeout,
                    )
                resp.raise_for_status()
                result = resp.json()
                # Join all translated segments back together
                full_translation = "".join(
                    segment[0] for segment in result[0] if segment[0]
                )
                # Google Translate sometimes returns \N instead of actual newlines
                full_translation = full_translation.replace('\\N', '\n').replace('\\n', '\n')
                parts = full_translation.split("\n")

                # Align output count with input count
                if len(parts) >= len(texts):
                    # More parts than expected — join excess into last entry
                    aligned = parts[:len(texts) - 1] + ["\n".join(parts[len(texts) - 1:])]
                else:
                    # Fewer parts — pad with empty strings
                    aligned = parts + [""] * (len(texts) - len(parts))

                # Restore empty placeholders
                return [
                    "" if processed[i] == "---" else aligned[i].strip()
                    for i in range(len(texts))
                ]
            except Exception as e:
                last_error = e
                if attempt < retries - 1:
                    time.sleep(0.5 * (attempt + 1))

        logger.error(f"Joined Google Translate failed after {retries} attempts: {last_error}")
        raise last_error

    def _translate_batch_joined(self, texts: List[str], batch_size: int = 20) -> List[str]:
        """Translate many short texts by chunking into joined requests (batch_size per request).
        Chunks are sent in parallel via ThreadPoolExecutor.
        """
        if not texts:
            return []

        results = [None] * len(texts)

        # Build chunks
        chunks = []
        for i in range(0, len(texts), batch_size):
            chunks.append((i, texts[i:i + batch_size]))

        with ThreadPoolExecutor(max_workers=min(self.concurrency, len(chunks))) as executor:
            future_to_start = {
                executor.submit(self._translate_joined_chunk, chunk_texts): start
                for start, chunk_texts in chunks
            }
            for future in as_completed(future_to_start):
                start = future_to_start[future]
                try:
                    chunk_results = future.result()
                    for j, translated in enumerate(chunk_results):
                        results[start + j] = translated
                except Exception as e:
                    # Fallback: translate this chunk individually
                    chunk_idx = start // batch_size
                    chunk_texts = chunks[chunk_idx][1]
                    logger.warning(f"Joined chunk failed, falling back to individual calls: {e}")
                    for j, text in enumerate(chunk_texts):
                        try:
                            results[start + j] = self._translate_text(text)
                        except Exception:
                            results[start + j] = ""

        return [r if r is not None else "" for r in results]

    # --- Validation (same logic as OpenAIClient) ---

    def has_chinese_characters(self, text: str) -> bool:
        """Check if text contains Chinese characters (ignoring kaomoji/emoticons)"""
        if not text:
            return False
        cleaned = _KAOMOJI_RE.sub('', text)
        return bool(_CHINESE_RE.search(cleaned))

    def has_pinyin(self, text: str) -> bool:
        """Check if text contains pinyin with tone marks (romanization)."""
        if not text:
            return False
        return bool(_PINYIN_RE.search(text))

    def validate_translation(self, original: str, translated: str, field_name: str) -> tuple[bool, str]:
        """
        Validate translation quality.
        Returns: (is_valid, error_message)
        """
        if not translated or translated.strip() == '':
            return False, f"{field_name} translation is empty"

        if self.has_chinese_characters(translated):
            return False, f"{field_name} translation still contains Chinese characters"

        # Pinyin check only for titles, not authors (author pen names are often romanizations)
        if field_name == 'title' and self.has_pinyin(translated):
            return False, f"{field_name} translation contains pinyin romanization: {translated}"

        # For 'appears untranslated' — skip check if original is already ASCII (numbers, single letters, etc.)
        if field_name != 'author' and original == translated:
            if not original.isascii():
                return False, f"{field_name} appears untranslated"

        return True, ""

    def strip_residual_chinese(self, text: str, field_name: str) -> str:
        """Last-resort cleanup: strip untranslatable Chinese fragments from otherwise-translated text.
        Used after all retries have failed — removes hashtag content, emoticons, isolated Chinese chars.
        """
        if not text:
            return text

        # Remove Chinese hashtag content: #双杰1V1, #XXX#
        text = re.sub(r'#[^#\s]*[\u4e00-\u9fff\u3400-\u4dbf][^#\s]*#?', '', text)

        # Remove isolated Chinese emoticon words: 嘤嘤嘤, 哈哈哈
        text = re.sub(r'[\u4e00-\u9fff\u3400-\u4dbf]{1,6}', '', text)

        # Clean up artifacts from removal (double spaces, orphaned punctuation)
        text = re.sub(r' {2,}', ' ', text)
        text = re.sub(r'^\s*[,;:]\s*', '', text)  # leading orphan punctuation
        text = re.sub(r'\s*[,;:]\s*$', '', text)  # trailing orphan punctuation
        text = re.sub(r'([,;:])\s*[,;:]', r'\1', text)  # double punctuation

        # For authors: also strip special chars like 丨 that aren't translated
        if field_name == 'author':
            text = text.replace('\u4e28', '')  # 丨 vertical bar CJK

        text = text.strip()

        # Apply casing after cleanup
        if field_name in ('title', 'genre', 'subgenre'):
            text = _clean_title(text)
        elif field_name == 'author':
            text = ' '.join(w.capitalize() for w in text.split()) if text else text
        elif field_name == 'synopsis':
            text = _sentence_case(text)

        return text

    # --- Book fields ---

    def translate_book_fields(self, data: Dict[str, str]) -> Dict[str, str]:
        """Translate book fields (title, author, synopsis, genre, subgenre)."""
        translation = {}

        for field in ('title', 'author', 'synopsis', 'genre', 'subgenre'):
            val = data.get(field, '')
            if not val:
                continue
            try:
                translated = self._translate_text(val)
                translated = _clean_text(translated)

                # Apply appropriate casing and cleanup
                if field in ('title', 'genre', 'subgenre'):
                    translated = _clean_title(translated)
                elif field == 'author':
                    translated = ' '.join(w.capitalize() for w in translated.split())
                elif field == 'synopsis':
                    translated = _sentence_case(translated)

                translation[field] = translated
            except Exception as e:
                logger.error(f"Failed to translate book field '{field}': {e}")
                raise

        return translation

    # --- Chapters ---

    def translate_chapters_batch(self, chapters: List[Dict], batch_size: int = None, strict: bool = True) -> List[str]:
        """Translate chapter titles via joined batching (20 per request). Returns list of translated strings.
        Set strict=False to skip Chinese validation and retries (useful for nicknames).
        """
        batch_size = batch_size or config.translation_batch_size
        titles = [ch['title'] for ch in chapters]
        translated = self._translate_batch_joined(titles, batch_size=20)

        result = []
        for i, t in enumerate(translated):
            t = _clean_title(_clean_text(t))
            if strict and self.has_chinese_characters(t):
                logger.warning(f"Chapter translation contains Chinese: {t}")
                try:
                    t = _clean_title(_clean_text(self._translate_text(chapters[i]['title'])))
                except Exception:
                    t = f"Chapter {chapters[i]['title']}"
            result.append(t)

        return result

    # --- Comments ---

    def translate_and_analyze_comments_batch(self, comments: List[Dict]) -> List[Dict[str, str]]:
        """
        Translate comment titles and content in parallel.
        Input: list of {id, title, content}
        Output: list of {id, title, content}
        """
        if not comments:
            return []

        # Build flat list of texts to translate (title + content per comment)
        texts = []
        for c in comments:
            texts.append(c.get('title', ''))
            texts.append(c.get('content', ''))

        translated = self._translate_batch(texts)

        results = []
        for i, comment in enumerate(comments):
            title_translated = _clean_text(translated[i * 2]) or ''
            content_translated = _clean_text(translated[i * 2 + 1]) or ''
            # Sentence case for content
            content_translated = _sentence_case(content_translated)
            results.append({
                'id': comment['id'],
                'title': title_translated,
                'content': content_translated,
            })

        return results

    # --- Booklists ---

    def translate_booklist(self, data: Dict) -> Dict:
        """Translate booklist title, description, and/or tags. Returns dict with translated fields."""
        result = {}

        if data.get('title'):
            try:
                translated = _clean_title(_clean_text(self._translate_text(data['title'])))
                if not self.has_chinese_characters(translated):
                    result['title'] = translated
                else:
                    logger.warning(f"Booklist title translation contains Chinese: {translated}")
            except Exception as e:
                logger.error(f"Failed to translate booklist title: {e}")

        if data.get('description'):
            try:
                translated = _sentence_case(_clean_text(self._translate_text(data['description'])))
                if not self.has_chinese_characters(translated):
                    result['description'] = translated
                else:
                    logger.warning(f"Booklist description translation contains Chinese: {translated}")
            except Exception as e:
                logger.error(f"Failed to translate booklist description: {e}")

        if data.get('tags'):
            try:
                translated_tags = self._translate_batch_joined(data['tags'], batch_size=20)
                valid_tags = []
                for t in translated_tags:
                    t = _clean_title(_clean_text(t))
                    if t and not self.has_chinese_characters(t):
                        valid_tags.append(t)
                if valid_tags:
                    result['tags'] = valid_tags
            except Exception as e:
                logger.error(f"Failed to translate booklist tags: {e}")

        return result

    def translate_booklist_comments_batch(self, items: List[Dict]) -> Dict[int, str]:
        """Translate multiple booklist curator comments in parallel.
        Input: list of {id, comment}
        Returns: dict mapping item id -> translated comment
        """
        if not items:
            return {}

        texts = [item['comment'] for item in items]
        translated = self._translate_batch(texts)

        result = {}
        for item, t in zip(items, translated):
            t = _sentence_case(_clean_text(t))
            if t and not self.has_chinese_characters(t):
                result[item['id']] = t

        return result
