"""Manual live smoke. Requires a fresh cookie in Redis (minter running, or
seed one manually). Run: .venv/Scripts/python.exe tests/smoke_qidian_mapping.py
(cwd = scraper/). Does NOT write to the DB."""
import sys
sys.path.insert(0, ".")
try:  # Windows console is cp1252; force utf-8 so Chinese prints don't crash.
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import redis
from core.config import config
from services.proxy_manager import RedisProxyManager
from services import qidian_cookie
from services.book_matcher import resolve_qidian_id

rconn = redis.from_url(config.redis["url"])
ck = qidian_cookie.get_cookie(rconn)
print("cookie present:", ck is not None, "stale:", qidian_cookie.is_stale(ck))
if not ck or qidian_cookie.is_stale(ck):
    print("No fresh cookie in Redis — start the cookie-minter first. Abort.")
    sys.exit(1)

pm = RedisProxyManager()
# Known-good: 玄鉴仙族 by 季越人 -> 1035420986
qid = resolve_qidian_id(rconn, pm, "玄鉴仙族", "季越人")
print("玄鉴仙族 / 季越人 ->", qid)
assert qid == 1035420986, f"expected 1035420986, got {qid}"

# Title-only fallback path: unique-ish title, wrong author.
qid2 = resolve_qidian_id(rconn, pm, "玄鉴仙族", "不存在作者")
print("玄鉴仙族 / wrong-author ->", qid2, "(fallback acceptable if single result)")

print("OK smoke_qidian_mapping")
