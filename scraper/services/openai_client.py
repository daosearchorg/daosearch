"""
OpenAI Client - Translation service wrapper
"""

import json
import re
import time
import logging
from typing import Dict, List
from openai import OpenAI
from core.config import config

logger = logging.getLogger(__name__)

# Structured output schemas — enforced by OpenRouter/OpenAI at the API level.
# Requires model support (Google Gemini, OpenAI GPT-4o, etc.)
# Falls back gracefully if model returns old dict format.

BOOK_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "book_translation",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "author": {"type": "string"},
                "synopsis": {"type": "string"},
                "genre": {"type": "string"},
                "subgenre": {"type": "string"}
            },
            "required": ["title", "author", "synopsis", "genre", "subgenre"],
            "additionalProperties": False
        }
    }
}

CHAPTER_BATCH_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "chapter_translations",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "chapters": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "integer"},
                            "title": {"type": "string"}
                        },
                        "required": ["id", "title"],
                        "additionalProperties": False
                    }
                }
            },
            "required": ["chapters"],
            "additionalProperties": False
        }
    }
}

COMMENT_BATCH_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "comment_translations",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "comments": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "integer"},
                            "title": {"type": "string"},
                            "content": {"type": "string"}
                        },
                        "required": ["id", "title", "content"],
                        "additionalProperties": False
                    }
                }
            },
            "required": ["comments"],
            "additionalProperties": False
        }
    }
}


BOOKLIST_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "booklist_translation",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["title", "description", "tags"],
            "additionalProperties": False
        }
    }
}

BOOKLIST_TAGS_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "booklist_tags_translation",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "tags": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["tags"],
            "additionalProperties": False
        }
    }
}

BOOKLIST_COMMENT_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "booklist_comment_translation",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "comment": {"type": "string"}
            },
            "required": ["comment"],
            "additionalProperties": False
        }
    }
}

BOOKLIST_COMMENTS_BATCH_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "booklist_comments_batch_translation",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "comments": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "integer"},
                            "comment": {"type": "string"}
                        },
                        "required": ["id", "comment"],
                        "additionalProperties": False
                    }
                }
            },
            "required": ["comments"],
            "additionalProperties": False
        }
    }
}


_CHINESE_RE = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf]')
_PINYIN_RE = re.compile(r'[āǎīǐōǒūǔǖǘǚǜ]')
# Kaomoji/emoticon patterns that contain decorative CJK chars (e.g. (#｀皿?), <怒>)
_KAOMOJI_RE = re.compile(
    r'[(\uff08][^)\uff09]{1,12}[)\uff09]'
    r'|<[^>]{1,12}>'
)


class OpenAIClient:
    """
    Handles OpenAI API calls for translation with rate limiting
    """

    def __init__(self):
        self.client = OpenAI(
            api_key=config.openai['api_key'],
            base_url=config.openai['base_url']
        )
        self.model = config.openai['model']
        self.fallback_model = config.openai['fallback_model']

    def has_chinese_characters(self, text: str) -> bool:
        """Check if text contains Chinese characters (ignoring kaomoji/emoticons)"""
        if not text:
            return False
        # Strip kaomoji patterns first — they use decorative CJK chars like 皿
        cleaned = _KAOMOJI_RE.sub('', text)
        return bool(_CHINESE_RE.search(cleaned))

    def has_pinyin(self, text: str) -> bool:
        """Check if text contains pinyin with tone marks (romanization)."""
        if not text:
            return False
        return bool(_PINYIN_RE.search(text))

    def validate_translation(self, original: str, translated: str, field_name: str) -> tuple[bool, str]:
        """
        Validate translation quality
        Returns: (is_valid, error_message)
        """
        if not translated or translated.strip() == '':
            return False, f"{field_name} translation is empty"

        if self.has_chinese_characters(translated):
            return False, f"{field_name} translation still contains Chinese characters"

        # Only check pinyin on short fields (title, author) — synopses/chapters can
        # legitimately contain tone-marked names (e.g. Japanese "Sōseki", Vietnamese)
        if field_name in ('title', 'author') and self.has_pinyin(translated):
            return False, f"{field_name} translation contains pinyin romanization: {translated}"

        # Skip identity check for author — pen names are often already romanized
        if field_name != 'author' and original == translated:
            return False, f"{field_name} appears untranslated"

        return True, ""

    def translate_book_fields(self, data: Dict[str, str]) -> Dict[str, str]:
        """
        Translate book fields (title, author, synopsis, genre, subgenre)
        """
        return self._translate_with_fallback(self._translate_book_fields_with_model, data)

    def _translate_book_fields_with_model(self, data: Dict[str, str], model: str) -> Dict[str, str]:
        """
        Translate book fields using specified model
        """
        system_prompt = "Translate Chinese web novel to English. No Chinese or pinyin in output. Translate meaning, not phonetics."

        # Only include fields with actual content to avoid hallucination on empty fields
        book_input = {}
        for field in ('title', 'author', 'synopsis', 'genre', 'subgenre'):
            val = data.get(field, '')
            if val:
                book_input[field] = val
        user_prompt = json.dumps(book_input, ensure_ascii=False)

        response = self.client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=2000,
            temperature=0.3 if model == self.fallback_model else 0.1,
            response_format=BOOK_SCHEMA,
            extra_headers={
                "HTTP-Referer": "https://daosearch.io",
                "X-Title": "DaoSearch",
            }
        )

        content = response.choices[0].message.content.strip()
        if not content:
            raise ValueError("Empty translation response")

        translation = json.loads(content)

        # Only require fields that had non-empty input
        required_fields = [f for f in ['title', 'author', 'synopsis'] if data.get(f)]
        for field in required_fields:
            if field not in translation or not translation[field]:
                raise ValueError(f"Missing required field: {field}")

        return translation

    def _translate_book_fields_with_context(self, data: Dict[str, str], model: str) -> Dict[str, str]:
        """
        Translate book fields using previous translation as context
        """
        system_prompt = "Translate Chinese web novel to English. No Chinese or pinyin in output. Translate meaning, not phonetics. Improve previous translation if provided."

        # Only include fields with actual content
        book_input = {}
        for field in ('title', 'author', 'synopsis', 'genre', 'subgenre'):
            val = data.get(field, '')
            if val:
                book_input[field] = val

        if 'previous_translation' in data:
            prev = data['previous_translation']
            prev_filtered = {}
            for field in ('title', 'author', 'synopsis'):
                val = prev.get(field, '')
                if val:
                    prev_filtered[field] = val
            if prev_filtered:
                book_input['previous_translation'] = prev_filtered

        user_prompt = json.dumps(book_input, ensure_ascii=False)

        response = self.client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=2000,
            temperature=0.3 if model == self.fallback_model else 0.1,
            response_format=BOOK_SCHEMA,
            extra_headers={
                "HTTP-Referer": "https://daosearch.io",
                "X-Title": "DaoSearch",
            }
        )

        content = response.choices[0].message.content.strip()
        if not content:
            raise ValueError("Empty translation response")

        translation = json.loads(content)

        # Only require fields that had non-empty input
        required_fields = [f for f in ['title', 'author', 'synopsis'] if data.get(f)]
        for field in required_fields:
            if field not in translation or not translation[field]:
                raise ValueError(f"Missing required field: {field}")

        return translation

    def _translate_with_fallback(self, translate_func, *args) -> Dict[str, str]:
        """
        Attempt translation with primary model, fallback to secondary if validation fails
        """
        original_data = args[0]
        primary_translation = None
        # Only require fields that had non-empty input
        required_fields = [f for f in ['title', 'author', 'synopsis'] if original_data.get(f)]

        try:
            primary_translation = translate_func(*args, self.model)

            has_chinese = False
            missing_fields = []
            for field in required_fields:
                if field not in primary_translation or not primary_translation[field]:
                    missing_fields.append(field)
                elif self.has_chinese_characters(primary_translation[field]):
                    has_chinese = True
                    logger.warning(f"Primary model translation contains Chinese in {field}: {primary_translation[field]}")

            if not has_chinese and not missing_fields:
                return primary_translation
            else:
                issues = []
                if has_chinese:
                    issues.append("contains Chinese characters")
                if missing_fields:
                    issues.append(f"missing fields: {missing_fields}")
                logger.warning(f"Primary model translation {', '.join(issues)}, trying fallback model")

        except Exception as e:
            logger.warning(f"Primary model translation failed: {e}, trying fallback model")

        if self.fallback_model:
            try:
                fallback_data = original_data.copy()

                if primary_translation:
                    fallback_data['previous_translation'] = primary_translation

                translation = self._translate_book_fields_with_context(fallback_data, self.fallback_model)

                has_chinese = False
                missing_fields = []

                for field in required_fields:
                    if field not in translation or not translation[field]:
                        missing_fields.append(field)
                    elif self.has_chinese_characters(translation[field]):
                        has_chinese = True
                        logger.error(f"Fallback model translation still contains Chinese in {field}: {translation[field]}")

                if missing_fields:
                    logger.error(f"Fallback model translation missing fields: {missing_fields}")

                return translation

            except Exception as e:
                logger.error(f"Fallback model translation failed: {e}")
                raise
        else:
            logger.error("No fallback model configured")
            raise Exception("Translation failed and no fallback model available")

    def translate_booklist(self, data: Dict[str, any]) -> Dict[str, any]:
        """Translate booklist title, description, and/or tags. Returns dict with translated fields."""
        system_prompt = (
            "Translate Chinese text to English. This is a curated reading list (booklist), NOT a novel. "
            "The title is the name of the reading list. The description explains what the list is about. "
            "Tags are short category labels. Translate the meaning accurately. No Chinese or pinyin in output."
        )

        # Build input with only fields that need translation
        bl_input = {}
        if data.get('title'):
            bl_input['title'] = data['title']
        if data.get('description'):
            bl_input['description'] = data['description']
        if data.get('tags'):
            bl_input['tags'] = data['tags']

        if not bl_input:
            return {}

        # Pick schema based on which fields are present
        has_text = 'title' in bl_input or 'description' in bl_input
        has_tags = 'tags' in bl_input
        if has_text and has_tags:
            schema = BOOKLIST_SCHEMA
        elif has_tags:
            schema = BOOKLIST_TAGS_SCHEMA
        else:
            schema = BOOKLIST_SCHEMA

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(bl_input, ensure_ascii=False)}
            ],
            max_tokens=2000,
            temperature=0.1,
            response_format=schema,
            extra_headers={
                "HTTP-Referer": "https://daosearch.io",
                "X-Title": "DaoSearch",
            }
        )

        content = response.choices[0].message.content.strip()
        if not content:
            raise ValueError("Empty booklist translation response")

        try:
            translation = json.loads(content)
        except json.JSONDecodeError:
            fixed = content.rstrip()
            if not fixed.endswith('}'):
                last_brace = fixed.rfind('}')
                if last_brace > 0:
                    fixed = fixed[:last_brace + 1]
            translation = json.loads(fixed)

        result = {}
        for field in ('title', 'description'):
            if field in bl_input and field in translation and translation[field]:
                if not self.has_chinese_characters(translation[field]):
                    result[field] = translation[field]
                else:
                    logger.warning(f"Booklist translation contains Chinese in {field}: {translation[field]}")

        # Validate translated tags
        if 'tags' in bl_input and 'tags' in translation and isinstance(translation['tags'], list):
            valid_tags = [t for t in translation['tags'] if t and not self.has_chinese_characters(t)]
            if valid_tags:
                result['tags'] = valid_tags

        return result

    def translate_booklist_comment(self, comment: str) -> str | None:
        """Translate a single booklist curator comment."""
        system_prompt = (
            "Translate this Chinese curator comment from a reading list to English. "
            "This is a short review or recommendation note about a book. "
            "Translate the meaning accurately. No Chinese or pinyin in output."
        )

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps({"comment": comment}, ensure_ascii=False)}
            ],
            max_tokens=1000,
            temperature=0.1,
            response_format=BOOKLIST_COMMENT_SCHEMA,
            extra_headers={
                "HTTP-Referer": "https://daosearch.io",
                "X-Title": "DaoSearch",
            }
        )

        content = response.choices[0].message.content.strip()
        if not content:
            return None

        result = json.loads(content)
        translated = result.get('comment', '')
        if translated and not self.has_chinese_characters(translated):
            return translated
        return None

    def translate_booklist_comments_batch(self, items: List[Dict[str, any]]) -> Dict[int, str]:
        """Translate multiple booklist curator comments in a single API call.
        Input: list of {id, comment}
        Returns: dict mapping item id -> translated comment
        """
        if not items:
            return {}

        system_prompt = (
            "Translate these Chinese curator comments from a reading list to English. "
            "These are short reviews or recommendation notes about books. "
            f"Return ALL {len(items)} comments. No Chinese or pinyin in output."
        )

        comments_input = [{"id": i + 1, "comment": item['comment']} for i, item in enumerate(items)]
        user_prompt = json.dumps(comments_input, ensure_ascii=False)

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=8000,
            temperature=0.1,
            response_format=BOOKLIST_COMMENTS_BATCH_SCHEMA,
            extra_headers={
                "HTTP-Referer": "https://daosearch.io",
                "X-Title": "DaoSearch",
            }
        )

        content = response.choices[0].message.content.strip()
        if not content:
            return {}

        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            # Try to fix truncated JSON from LLM
            fixed = content.rstrip()
            if not fixed.endswith('}'):
                last_brace = fixed.rfind('}')
                if last_brace > 0:
                    fixed = fixed[:last_brace + 1]
            try:
                result = json.loads(fixed)
            except json.JSONDecodeError:
                logger.error("Failed to parse booklist comment translation JSON")
                return {}

        translations_by_seq = {}
        for t in result.get('comments', []):
            if isinstance(t, dict) and 'id' in t:
                translations_by_seq[t['id']] = t.get('comment', '')

        # Map back to original item IDs
        translated = {}
        for i, item in enumerate(items):
            comment = translations_by_seq.get(i + 1, '')
            if comment and not self.has_chinese_characters(comment):
                translated[item['id']] = comment

        return translated

    def translate_chapters_batch(self, chapters: List[Dict[str, any]], batch_size: int = None) -> List[str]:
        """
        Translate chapter titles in batches using structured output schema
        """
        batch_size = batch_size or config.translation_batch_size
        translated_titles = []

        for i in range(0, len(chapters), batch_size):
            batch = chapters[i:i + batch_size]

            try:
                # Array-based input for structured output
                chapters_input = []
                for j, ch in enumerate(batch):
                    chapters_input.append({"id": j + 1, "title": ch['title']})

                system_prompt = f"Translate Chinese to English. Return ALL {len(batch)} chapters. No Chinese or pinyin in output."
                user_prompt = json.dumps(chapters_input, ensure_ascii=False)

                content = None
                for attempt in range(3):
                    response = self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        max_tokens=4000,
                        temperature=0.1,
                        response_format=CHAPTER_BATCH_SCHEMA,
                        extra_headers={
                            "HTTP-Referer": "https://daosearch.io",
                            "X-Title": "DaoSearch",
                        }
                    )
                    content = response.choices[0].message.content.strip()
                    if content:
                        break
                    logger.warning(f"Empty response on attempt {attempt + 1}/3, retrying...")
                    time.sleep(1)

                if not content:
                    raise ValueError("Empty translation response after 3 attempts")

                try:
                    translation_result = json.loads(content)
                except json.JSONDecodeError:
                    # Try to fix truncated JSON
                    fixed = content.rstrip()
                    if not fixed.endswith('}'):
                        last_brace = fixed.rfind('}')
                        if last_brace > 0:
                            fixed = fixed[:last_brace + 1]
                        else:
                            fixed = fixed + '"]}'
                    translation_result = json.loads(fixed)

                # Build lookup from structured array response
                translations_by_id = {}
                for t in translation_result.get('chapters', []):
                    if isinstance(t, dict) and 'id' in t:
                        translations_by_id[t['id']] = t.get('title', '')

                # Fallback: handle old dict-with-numbered-keys format
                if not translations_by_id and isinstance(translation_result, dict) and 'chapters' not in translation_result:
                    for key, val in translation_result.items():
                        if key.isdigit() and isinstance(val, str):
                            translations_by_id[int(key)] = val

                for j, ch in enumerate(batch):
                    translated = translations_by_id.get(j + 1) or translations_by_id.get(j)
                    if translated:
                        translated_title = translated.strip() if isinstance(translated, str) else str(translated).strip()

                        if self.has_chinese_characters(translated_title):
                            logger.warning(f"Chapter translation contains Chinese: {translated_title}")
                            translated_title = self._translate_single_chapter(ch['title'])

                        translated_titles.append(translated_title)
                    else:
                        logger.warning(f"Missing translation for chapter {j+1}")
                        translated_titles.append(self._translate_single_chapter(ch['title']))

                if i + batch_size < len(chapters):
                    time.sleep(0.5)

            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.error(f"JSON parsing failed for batch translation: {e}")
                for ch in batch:
                    translated_titles.append(self._translate_single_chapter(ch['title']))

            except Exception as e:
                logger.error(f"Batch translation failed: {e}")
                for ch in batch:
                    translated_titles.append(self._translate_single_chapter(ch['title']))

        return translated_titles

    def translate_and_analyze_comments_batch(self, comments: List[Dict[str, any]]) -> List[Dict[str, str]]:
        """
        Translate comment titles/content using structured output.
        Caller must ensure batch size (max 30 comments).
        Input: list of {id, title, content}
        Output: list of {id, title, content}
        """
        results = []
        if not comments:
            return results

        try:
            # Array-based input for structured output
            comments_input = []
            for j, comment in enumerate(comments):
                comments_input.append({
                    "id": j + 1,
                    "title": comment.get('title', ''),
                    "content": comment.get('content', '')
                })

            system_prompt = f"Translate Chinese to English. Return ALL {len(comments)} comments. No Chinese or pinyin in output."
            user_prompt = json.dumps(comments_input, ensure_ascii=False)

            content = None
            for attempt in range(3):
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    max_tokens=16000,
                    temperature=0.1,
                    response_format=COMMENT_BATCH_SCHEMA,
                    extra_headers={
                        "HTTP-Referer": "https://daosearch.io",
                        "X-Title": "DaoSearch",
                    }
                )
                content = response.choices[0].message.content.strip()
                if content:
                    break
                logger.warning(f"Empty comment translation response on attempt {attempt + 1}/3, retrying...")
                time.sleep(1)

            if not content:
                raise ValueError("Empty translation response after 3 attempts")

            try:
                translation_result = json.loads(content)
            except json.JSONDecodeError:
                fixed = content.rstrip()
                if not fixed.endswith('}'):
                    last_brace = fixed.rfind('}')
                    if last_brace > 0:
                        fixed = fixed[:last_brace + 1]
                translation_result = json.loads(fixed)

            # Build lookup from structured array response
            translations_by_id = {}
            for t in translation_result.get('comments', []):
                if isinstance(t, dict) and 'id' in t:
                    translations_by_id[t['id']] = t

            # Fallback: handle old dict-with-numbered-keys format
            if not translations_by_id and isinstance(translation_result, dict) and 'comments' not in translation_result:
                for key, val in translation_result.items():
                    if key.isdigit() and isinstance(val, dict):
                        translations_by_id[int(key)] = val

            for j, comment in enumerate(comments):
                result = translations_by_id.get(j + 1) or translations_by_id.get(j)

                if result and isinstance(result, dict):
                    results.append({
                        'id': comment['id'],
                        'title': result.get('title', ''),
                        'content': result.get('content', ''),
                    })
                else:
                    logger.warning(f"Missing translation for comment seq {j+1} (db_id={comment['id']})")
                    results.append({
                        'id': comment['id'],
                        'title': '',
                        'content': '',
                    })

        except Exception as e:
            logger.error(f"Comment batch translation failed: {e}")
            for comment in comments:
                results.append({
                    'id': comment['id'],
                    'title': '',
                    'content': '',
                })

        return results

    def _translate_single_chapter(self, title: str) -> str:
        """Translate a single chapter title"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "Translate Chinese to English. Return only the translation."},
                    {"role": "user", "content": title}
                ],
                max_tokens=200,
                temperature=0.1,
                extra_headers={
                    "HTTP-Referer": "https://daosearch.io",
                    "X-Title": "DaoSearch",
                }
            )

            translation = response.choices[0].message.content.strip()

            if self.has_chinese_characters(translation):
                logger.error(f"Translation still contains Chinese for: {title}")
                return f"Chapter {title}"

            return translation

        except Exception as e:
            logger.error(f"Single chapter translation failed: {e}")
            return title
