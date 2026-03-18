"""Entity CRUD endpoints — user general entities."""

from __future__ import annotations

from fastapi import APIRouter, Header
from pydantic import BaseModel
from sqlalchemy import text

from db import async_session

router = APIRouter(prefix="/entities")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class UserGeneralEntityCreate(BaseModel):
    original_name: str
    translated_name: str
    gender: str = "N"


class UserGeneralEntityOut(BaseModel):
    id: int
    original_name: str
    translated_name: str
    gender: str


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


