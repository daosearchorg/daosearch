"""Run: .venv/Scripts/python.exe tests/test_qidian_cookie.py  (cwd = scraper/)

Uses an inline fake (no fakeredis dep) so the scraper image's
`uv sync --frozen` stays valid — zero new dependencies."""
import sys, time
sys.path.insert(0, ".")
from services import qidian_cookie as qc


class FakeRedis:
    """Minimal in-process stand-in for the redis methods we use."""
    def __init__(self):
        self._d = {}
    def set(self, k, v, ex=None):       # ex ignored — not under test
        self._d[k] = v
    def get(self, k):
        return self._d.get(k)
    def delete(self, k):
        self._d.pop(k, None)
    def exists(self, k):
        return 1 if k in self._d else 0


def test_roundtrip_and_age():
    r = FakeRedis()
    assert qc.get_cookie(r) is None  # empty store

    qc.set_cookie(r, "WTSFP_VALUE", "CSRF_VALUE")
    c = qc.get_cookie(r)
    assert c is not None
    assert c["w_tsfp"] == "WTSFP_VALUE"
    assert c["_csrfToken"] == "CSRF_VALUE"
    assert qc.cookie_header(c) == "_csrfToken=CSRF_VALUE; w_tsfp=WTSFP_VALUE"
    # _csrfToken is optional — omitted entirely when empty/absent.
    assert qc.cookie_header({"w_tsfp": "W", "_csrfToken": ""}) == "w_tsfp=W"
    assert qc.cookie_header({"w_tsfp": "W"}) == "w_tsfp=W"

    # stale detection
    c["minted_at"] = time.time() - (qc.COOKIE_MAX_AGE_SECONDS + 10)
    assert qc.is_stale(c) is True
    fresh = {"w_tsfp": "x", "_csrfToken": "y", "minted_at": time.time()}
    assert qc.is_stale(fresh) is False


def test_remint_flag():
    r = FakeRedis()
    assert qc.remint_requested(r) is False
    qc.request_remint(r)
    assert qc.remint_requested(r) is True
    qc.clear_remint(r)
    assert qc.remint_requested(r) is False


if __name__ == "__main__":
    test_roundtrip_and_age()
    test_remint_flag()
    print("OK test_qidian_cookie")
