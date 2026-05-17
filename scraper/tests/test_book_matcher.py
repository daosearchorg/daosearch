"""Run: .venv/Scripts/python.exe tests/test_book_matcher.py  (cwd = scraper/)"""
import sys
sys.path.insert(0, ".")
from services import book_matcher as bm

# Fixture mirroring www.qidian.com/so/ structure. ONE row has title 天启预报;
# the second row is the "title-as-author" trap (title differs, author == 天启预报).
FIXTURE = """
<html><body>
<div class="book-img-text"><ul>
  <li class="res-book-item" data-bid="1014180485" data-rid="1" data-auid="4374001">
    <div class="book-mid-info">
      <h3 class="book-info-title"><a href="//www.qidian.com/book/1014180485/" target="_blank">天启预报</a></h3>
      <p class="author"><a class="name" href="//my.qidian.com/author/4374001/">风月</a>
        <span>完结</span></p>
    </div>
  </li>
  <li class="res-book-item" data-bid="1019781008" data-rid="2" data-auid="999">
    <div class="book-mid-info">
      <h3 class="book-info-title"><a href="//www.qidian.com/book/1019781008/" target="_blank">从一根草开始穿越</a></h3>
      <p class="author"><a class="name" href="//my.qidian.com/author/999/">天启预报</a>
        <span>连载</span></p>
    </div>
  </li>
</ul></div>
</body></html>
"""

# Two rows with the SAME exact title but different authors — the ambiguous case.
AMBIG_FIXTURE = """
<html><body><ul>
  <li class="res-book-item" data-bid="100" data-rid="1" data-auid="11">
    <div class="book-mid-info">
      <h3 class="book-info-title"><a href="//www.qidian.com/book/100/">重名之书</a></h3>
      <p class="author"><a class="name" href="//my.qidian.com/author/11/">作者甲</a><span>连载</span></p>
    </div>
  </li>
  <li class="res-book-item" data-bid="200" data-rid="2" data-auid="22">
    <div class="book-mid-info">
      <h3 class="book-info-title"><a href="//www.qidian.com/book/200/">重名之书</a></h3>
      <p class="author"><a class="name" href="//my.qidian.com/author/22/">作者乙</a><span>完结</span></p>
    </div>
  </li>
</ul></body></html>
"""

SINGLE_TITLE_FIXTURE = """
<html><body><ul>
  <li class="res-book-item" data-bid="555" data-rid="1" data-auid="1">
    <div class="book-mid-info">
      <h3 class="book-info-title"><a href="//www.qidian.com/book/555/">独一无二的书</a></h3>
      <p class="author"><a class="name" href="//my.qidian.com/author/1/">某作者</a><span>连载</span></p>
    </div>
  </li>
</ul></body></html>
"""


def test_parse_results():
    rows = bm.parse_qidian_search(FIXTURE)
    assert len(rows) == 2
    assert rows[0] == {"bid": 1014180485, "title": "天启预报", "author": "风月", "status": "完结"}
    assert rows[1]["title"] == "从一根草开始穿越"
    assert rows[1]["author"] == "天启预报"  # title-as-author trap row


def test_exact_title_and_author_beats_trap_row():
    rows = bm.parse_qidian_search(FIXTURE)
    # Exact title+author wins; the trap row (title appears as author) is ignored.
    assert bm.pick_match(rows, "天启预报", "风月") == 1014180485


def test_single_title_hit_falls_back_regardless_of_author():
    # Only ONE row has title 天启预报 -> single-result fallback always fires,
    # even when the author mismatches or is unknown (agreed decision rule).
    rows = bm.parse_qidian_search(FIXTURE)
    assert bm.pick_match(rows, "天启预报", "不存在的作者") == 1014180485
    assert bm.pick_match(rows, "天启预报", None) == 1014180485


def test_ambiguous_same_title_multiple_rows():
    rows = bm.parse_qidian_search(AMBIG_FIXTURE)
    # Exact title+author still resolves.
    assert bm.pick_match(rows, "重名之书", "作者甲") == 100
    assert bm.pick_match(rows, "重名之书", "作者乙") == 200
    # >1 title-exact result and no author match -> ambiguous -> None.
    assert bm.pick_match(rows, "重名之书", "作者丙") is None
    assert bm.pick_match(rows, "重名之书", None) is None


def test_title_only_fallback_single_result():
    rows = bm.parse_qidian_search(SINGLE_TITLE_FIXTURE)
    # Exactly one title-exact result and author unknown/mismatch -> accept it.
    assert bm.pick_match(rows, "独一无二的书", None) == 555
    assert bm.pick_match(rows, "独一无二的书", "作者写错了") == 555
    # Title not present at all -> None.
    assert bm.pick_match(rows, "不存在", None) is None


if __name__ == "__main__":
    test_parse_results()
    test_exact_title_and_author_beats_trap_row()
    test_single_title_hit_falls_back_regardless_of_author()
    test_ambiguous_same_title_multiple_rows()
    test_title_only_fallback_single_result()
    print("OK test_book_matcher")
