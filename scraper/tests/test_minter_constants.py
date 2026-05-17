"""Run: .venv/Scripts/python.exe tests/test_minter_constants.py  (cwd = scraper/)"""
import re
import sys
import pathlib
sys.path.insert(0, ".")
from services import qidian_cookie as qc

minter_src = (pathlib.Path("..") / "cookie-minter" / "minter.py").read_text(encoding="utf-8")


def _literal(name: str) -> str:
    m = re.search(rf'^{name}\s*=\s*"([^"]+)"', minter_src, re.M)
    assert m, f"{name} not found in minter.py"
    return m.group(1)


def test_keys_match():
    assert _literal("QIDIAN_COOKIE_KEY") == qc.QIDIAN_COOKIE_KEY
    assert _literal("QIDIAN_REMINT_FLAG") == qc.QIDIAN_REMINT_FLAG


if __name__ == "__main__":
    test_keys_match()
    print("OK test_minter_constants")
