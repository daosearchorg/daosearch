"""Entity CRUD endpoints — novel entities, user general entities, user overrides."""

from __future__ import annotations

from fastapi import APIRouter, Query, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from db import async_session

router = APIRouter(prefix="/entities")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class EntityOut(BaseModel):
    id: int
    original_name: str
    translated_name: str
    gender: str
    is_hidden: bool = False
    custom_name: str | None = None


class UserGeneralEntityCreate(BaseModel):
    original_name: str
    translated_name: str
    gender: str = "N"


class UserGeneralEntityOut(BaseModel):
    id: int
    original_name: str
    translated_name: str
    gender: str


class OverrideCreate(BaseModel):
    custom_name: str
    is_hidden: bool = False


# ---------------------------------------------------------------------------
# Novel entities
# ---------------------------------------------------------------------------

@router.get("/novel")
async def get_novel_entities(
    book_id: int = Query(...),
    x_user_id: int | None = Header(None, alias="x-user-id"),
):
    """Get entities for a novel, with user overrides merged if authenticated."""
    async with async_session() as session:
        if x_user_id:
            rows = await session.execute(text("""
                SELECT ne.id, ne.original_name, ne.translated_name, ne.gender, ne.is_hidden,
                       ueo.custom_name, COALESCE(ueo.is_hidden, ne.is_hidden) as effective_hidden
                FROM novel_entities ne
                LEFT JOIN user_entity_overrides ueo ON ueo.novel_entity_id = ne.id AND ueo.user_id = :user_id
                WHERE ne.book_id = :book_id
                ORDER BY ne.original_name
            """), {"book_id": book_id, "user_id": x_user_id})
        else:
            rows = await session.execute(text("""
                SELECT id, original_name, translated_name, gender, is_hidden,
                       NULL as custom_name, is_hidden as effective_hidden
                FROM novel_entities
                WHERE book_id = :book_id
                ORDER BY original_name
            """), {"book_id": book_id})

        return [
            EntityOut(
                id=r.id,
                original_name=r.original_name,
                translated_name=r.custom_name or r.translated_name,
                gender=r.gender or "N",
                is_hidden=r.effective_hidden,
                custom_name=r.custom_name,
            )
            for r in rows
        ]


# ---------------------------------------------------------------------------
# User general entities
# ---------------------------------------------------------------------------

@router.get("/general")
async def get_user_general_entities(
    x_user_id: int = Header(..., alias="x-user-id"),
):
    """Get user's personal general entities."""
    async with async_session() as session:
        rows = await session.execute(text("""
            SELECT id, original_name, translated_name, gender
            FROM user_general_entities
            WHERE user_id = :user_id
            ORDER BY original_name
        """), {"user_id": x_user_id})

        return [
            UserGeneralEntityOut(
                id=r.id,
                original_name=r.original_name,
                translated_name=r.translated_name,
                gender=r.gender or "N",
            )
            for r in rows
        ]


@router.post("/general")
async def create_user_general_entity(
    body: UserGeneralEntityCreate,
    x_user_id: int = Header(..., alias="x-user-id"),
):
    """Create a user general entity."""
    async with async_session() as session:
        result = await session.execute(text("""
            INSERT INTO user_general_entities (user_id, original_name, translated_name, gender, created_at, updated_at)
            VALUES (:user_id, :original, :translated, :gender, NOW(), NOW())
            ON CONFLICT (user_id, original_name) DO UPDATE SET
                translated_name = :translated, gender = :gender, updated_at = NOW()
            RETURNING id
        """), {
            "user_id": x_user_id,
            "original": body.original_name,
            "translated": body.translated_name,
            "gender": body.gender,
        })
        await session.commit()
        row = result.first()
        return {"id": row.id if row else None}


@router.delete("/general/{entity_id}")
async def delete_user_general_entity(
    entity_id: int,
    x_user_id: int = Header(..., alias="x-user-id"),
):
    """Delete a user general entity."""
    async with async_session() as session:
        await session.execute(text("""
            DELETE FROM user_general_entities WHERE id = :id AND user_id = :user_id
        """), {"id": entity_id, "user_id": x_user_id})
        await session.commit()
        return {"ok": True}


# ---------------------------------------------------------------------------
# User entity overrides (for novel entities)
# ---------------------------------------------------------------------------

@router.put("/override/{entity_id}")
async def create_or_update_override(
    entity_id: int,
    body: OverrideCreate,
    x_user_id: int = Header(..., alias="x-user-id"),
):
    """Create or update a user override for a novel entity."""
    async with async_session() as session:
        await session.execute(text("""
            INSERT INTO user_entity_overrides (user_id, novel_entity_id, custom_name, is_hidden, created_at, updated_at)
            VALUES (:user_id, :entity_id, :custom_name, :is_hidden, NOW(), NOW())
            ON CONFLICT (user_id, novel_entity_id) DO UPDATE SET
                custom_name = :custom_name, is_hidden = :is_hidden, updated_at = NOW()
        """), {
            "user_id": x_user_id,
            "entity_id": entity_id,
            "custom_name": body.custom_name,
            "is_hidden": body.is_hidden,
        })
        await session.commit()
        return {"ok": True}


@router.delete("/override/{entity_id}")
async def delete_override(
    entity_id: int,
    x_user_id: int = Header(..., alias="x-user-id"),
):
    """Remove a user override for a novel entity (reverts to base translation)."""
    async with async_session() as session:
        await session.execute(text("""
            DELETE FROM user_entity_overrides WHERE novel_entity_id = :entity_id AND user_id = :user_id
        """), {"entity_id": entity_id, "user_id": x_user_id})
        await session.commit()
        return {"ok": True}
