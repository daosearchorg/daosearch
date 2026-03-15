"""LLM clients for translation with streaming support.

Two implementations:
- GeminiClient: Uses Google Gemini SDK with prompt caching (for AI Premium tier)
- OpenAIClient: Uses OpenAI-compatible API (for BYOK tier)

Both support:
- complete(): Full response (for structured output)
- stream(): Token-by-token streaming (for translation chunks)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncIterator

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class GeminiClient:
    """Async Gemini SDK wrapper with prompt caching and streaming."""

    def __init__(self, api_key: str):
        from google import genai
        self._client = genai.Client(api_key=api_key)
        self._cache_map: dict[str, Any] = {}
        self._no_cache_models: set[str] = set()

    def _get_or_create_cache(self, model: str, system_prompt: str):
        from google.genai import types

        if model in self._no_cache_models:
            return None

        cache_key = f"{model}:{hash(system_prompt)}"
        if cache_key in self._cache_map:
            return self._cache_map[cache_key]

        try:
            cached = self._client.caches.create(
                model=model,
                config=types.CreateCachedContentConfig(
                    system_instruction=system_prompt,
                    ttl="3600s",
                ),
            )
            self._cache_map[cache_key] = cached
            return cached
        except Exception:
            self._no_cache_models.add(model)
            return None

    async def complete(
        self,
        model: str,
        user_prompt: str,
        *,
        system_prompt: str | None = None,
        temperature: float = 0.5,
        max_tokens: int = 8000,
        response_schema: type[BaseModel] | None = None,
    ) -> Any:
        """Full response — used for structured output (entity detection, etc.)."""
        from google.genai import types

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )

        if system_prompt:
            cached = self._get_or_create_cache(model, system_prompt)
            if cached:
                config.cached_content = cached.name
            else:
                config.system_instruction = system_prompt

        if response_schema:
            config.response_mime_type = "application/json"
            config.response_schema = response_schema

        for attempt in range(3):
            try:
                response = await self._client.aio.models.generate_content(
                    model=model, contents=user_prompt, config=config,
                )
                text = response.text
                if not text:
                    raise ValueError("Empty response")
                if response_schema:
                    return response_schema.model_validate_json(text)
                return text
            except Exception:
                if attempt < 2:
                    await asyncio.sleep(2 ** (attempt + 1))
                    continue
                raise

    async def stream(
        self,
        model: str,
        user_prompt: str,
        *,
        system_prompt: str | None = None,
        temperature: float = 0.5,
        max_tokens: int = 8000,
    ) -> AsyncIterator[str]:
        """Stream tokens as they arrive from Gemini."""
        from google.genai import types

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )

        if system_prompt:
            cached = self._get_or_create_cache(model, system_prompt)
            if cached:
                config.cached_content = cached.name
            else:
                config.system_instruction = system_prompt

        async for chunk in await self._client.aio.models.generate_content_stream(
            model=model, contents=user_prompt, config=config,
        ):
            if chunk.text:
                yield chunk.text


class OpenAIClient:
    """OpenAI-compatible client with streaming for BYOK."""

    def __init__(self, api_key: str, base_url: str, model: str):
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    async def complete(
        self,
        model: str | None = None,
        user_prompt: str = "",
        *,
        system_prompt: str | None = None,
        temperature: float = 0.5,
        max_tokens: int = 8000,
        response_schema: type[BaseModel] | None = None,
    ) -> Any:
        """Full response — used for structured output."""
        use_model = model or self._model
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        kwargs: dict[str, Any] = {
            "model": use_model, "messages": messages,
            "temperature": temperature, "max_tokens": max_tokens,
        }
        if response_schema:
            kwargs["response_format"] = {"type": "json_object"}

        for attempt in range(3):
            try:
                response = await self._client.chat.completions.create(**kwargs)
                text = response.choices[0].message.content
                if not text:
                    raise ValueError("Empty response")
                if response_schema:
                    return response_schema.model_validate_json(text)
                return text
            except Exception:
                if attempt < 2:
                    await asyncio.sleep(2 ** (attempt + 1))
                    continue
                raise

    async def stream(
        self,
        model: str | None = None,
        user_prompt: str = "",
        *,
        system_prompt: str | None = None,
        temperature: float = 0.5,
        max_tokens: int = 8000,
    ) -> AsyncIterator[str]:
        """Stream tokens as they arrive from OpenAI-compatible API."""
        use_model = model or self._model
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        response = await self._client.chat.completions.create(
            model=use_model, messages=messages,
            temperature=temperature, max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content
