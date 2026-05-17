"""Redis-backed store for the qidian.com w_tsfp anti-bot cookie.

The cookie is minted by the cookie-minter sidecar (Playwright) and consumed
by requests-based workers. Not IP-bound; ~20 min hard lifetime, not rotated.
"""
import json
import time
import logging

logger = logging.getLogger(__name__)

QIDIAN_COOKIE_KEY = "qidian:cookie"
QIDIAN_REMINT_FLAG = "qidian:cookie:remint"
COOKIE_MAX_AGE_SECONDS = 1080  # 18 min — workers refuse older cookies


def set_cookie(redis_client, w_tsfp: str, csrf_token: str) -> None:
    payload = json.dumps({
        "w_tsfp": w_tsfp,
        "_csrfToken": csrf_token,
        "minted_at": time.time(),
    })
    # Expire the key a bit past the hard lifetime so a dead minter is obvious.
    redis_client.set(QIDIAN_COOKIE_KEY, payload, ex=1500)


def get_cookie(redis_client) -> dict | None:
    raw = redis_client.get(QIDIAN_COOKIE_KEY)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        logger.warning("Corrupt qidian cookie payload in Redis")
        return None


def is_stale(cookie: dict | None) -> bool:
    if not cookie or "minted_at" not in cookie:
        return True
    return (time.time() - cookie["minted_at"]) > COOKIE_MAX_AGE_SECONDS


def cookie_header(cookie: dict) -> str:
    """Cookie header string in a stable order. _csrfToken is optional
    (only guards POST/API calls) — omitted when absent/empty."""
    parts = []
    csrf = cookie.get("_csrfToken")
    if csrf:
        parts.append(f"_csrfToken={csrf}")
    parts.append(f"w_tsfp={cookie['w_tsfp']}")
    return "; ".join(parts)


def request_remint(redis_client) -> None:
    redis_client.set(QIDIAN_REMINT_FLAG, "1", ex=300)


def remint_requested(redis_client) -> bool:
    return redis_client.exists(QIDIAN_REMINT_FLAG) == 1


def clear_remint(redis_client) -> None:
    redis_client.delete(QIDIAN_REMINT_FLAG)
