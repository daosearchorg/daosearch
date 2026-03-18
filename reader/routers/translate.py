import asyncio
import json
import logging

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class TranslateRequest(BaseModel):
    content: str                          # raw chapter text (newline-separated paragraphs)
    book_id: int | None = None            # optional — for entity loading/saving
    translate: str = "ai"                 # "ai" (Gemini) or "byok"
    custom_instructions: str | None = None
    title: str | None = None              # chapter title — prepended to first chunk for translation


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------

def _sse(event: str, data: str) -> str:
    """Format a Server-Sent Event. Handles multi-line data correctly."""
    data_lines = "\n".join(f"data: {line}" for line in data.split("\n"))
    return f"event: {event}\n{data_lines}\n\n"


# ---------------------------------------------------------------------------
# Shared: build LLM client + model
# ---------------------------------------------------------------------------

def _build_llm(
    translate: str,
    byok_key: str | None,
    byok_endpoint: str | None,
    byok_model: str | None,
):
    """Return (llm_client, model_name) or raise HTTPException."""
    from config import settings

    if translate == "ai":
        if not settings.gemini_api_key:
            raise HTTPException(status_code=503, detail="AI translation not configured on this server.")
        from translation.llm_client import GeminiClient
        return GeminiClient(api_key=settings.gemini_api_key), settings.translation_model

    if translate == "byok":
        if not byok_key or not byok_endpoint:
            raise HTTPException(status_code=400, detail="BYOK API key and endpoint required.")
        from translation.llm_client import OpenAIClient
        model = byok_model or "gpt-4o"
        return OpenAIClient(api_key=byok_key, base_url=byok_endpoint, model=model), model

    raise HTTPException(status_code=400, detail="Invalid translate tier. Use 'ai' or 'byok'.")


# ---------------------------------------------------------------------------
# POST /translate/stream — SSE streaming
# ---------------------------------------------------------------------------

@router.post("/translate/stream")
async def translate_stream(
    body: TranslateRequest,
    x_user_id: int | None = Header(None, alias="x-user-id"),
    x_byok_key: str | None = Header(None, alias="x-byok-key"),
    x_byok_endpoint: str | None = Header(None, alias="x-byok-endpoint"),
    x_byok_model: str | None = Header(None, alias="x-byok-model"),
):
    """Stream translation via Server-Sent Events."""
    llm, model = _build_llm(body.translate, x_byok_key, x_byok_endpoint, x_byok_model)

    return StreamingResponse(
        _stream_translation(
            llm=llm,
            model=model,
            content=body.content,
            book_id=body.book_id,
            user_id=x_user_id,
            custom_instructions=body.custom_instructions,
            title=body.title,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_translation(
    llm,
    model: str,
    content: str,
    book_id: int | None,
    user_id: int | None,
    custom_instructions: str | None,
    title: str | None = None,
):
    """SSE generator for chapter translation."""
    from translation.pipeline import translate_chapter_stream
    from db import async_session as get_session

    session_ctx = get_session() if book_id else None
    session = None

    try:
        if session_ctx is not None:
            session = await session_ctx.__aenter__()

        async for event in translate_chapter_stream(
            llm=llm,
            raw_content=content,
            session=session,
            book_id=book_id,
            user_id=user_id,
            model=model,
            custom_instructions=custom_instructions,
            title=title,
        ):
            yield _sse(event.event, event.data)
            await asyncio.sleep(0)  # force flush

    except Exception as e:
        logger.error(f"Translation stream error: {e}")
        yield _sse("error", str(e))

    finally:
        if session_ctx is not None and session is not None:
            await session_ctx.__aexit__(None, None, None)


# ---------------------------------------------------------------------------
# POST /translate — non-streaming, full JSON result
# ---------------------------------------------------------------------------

@router.post("/translate")
async def translate(
    body: TranslateRequest,
    x_user_id: int | None = Header(None, alias="x-user-id"),
    x_byok_key: str | None = Header(None, alias="x-byok-key"),
    x_byok_endpoint: str | None = Header(None, alias="x-byok-endpoint"),
    x_byok_model: str | None = Header(None, alias="x-byok-model"),
):
    """Run full translation pipeline and return collected JSON result."""
    from translation.pipeline import translate_chapter_stream
    from db import async_session as get_session

    llm, model = _build_llm(body.translate, x_byok_key, x_byok_endpoint, x_byok_model)

    session_ctx = get_session() if body.book_id else None
    session = None

    paragraphs: list[dict] = []
    entities: list[dict] = []
    title: str | None = None

    try:
        if session_ctx is not None:
            session = await session_ctx.__aenter__()

        async for event in translate_chapter_stream(
            llm=llm,
            raw_content=body.content,
            session=session,
            book_id=body.book_id,
            user_id=x_user_id,
            model=model,
            custom_instructions=body.custom_instructions,
            title=body.title,
        ):
            if event.event == "entity":
                entities.append(json.loads(event.data))
            elif event.event == "chunk_done":
                chunk_data = json.loads(event.data)
                paragraphs.extend(chunk_data.get("paragraphs", []))
            elif event.event == "title":
                title = event.data
            elif event.event == "error":
                raise HTTPException(status_code=500, detail=event.data)

    finally:
        if session_ctx is not None and session is not None:
            await session_ctx.__aexit__(None, None, None)

    # Sort paragraphs by index
    paragraphs.sort(key=lambda p: p.get("index", 0))

    return {
        "paragraphs": paragraphs,
        "entities": entities,
        "title": title,
    }
