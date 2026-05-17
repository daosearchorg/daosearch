"""Run: .venv/Scripts/python.exe tests/test_qidian_charts.py  (cwd = scraper/)"""
import sys
sys.path.insert(0, ".")
from workers import qidian_charts_scraper as qcs

FIXTURE = """
<html><body><div class="rank-body"><ul>
  <li data-rid="1">
    <div class="book-img-box"><a href="//www.qidian.com/book/1009817672/"></a></div>
    <div class="book-mid-info">
      <h2><a data-bid="1009817672" href="//www.qidian.com/book/1009817672/" title="轮回乐园最新章节">轮回乐园</a></h2>
      <p class="author"><a class="name" href="//my.qidian.com/author/3609041/">那一只蚊子</a>
        <em>|</em><span>连载</span></p>
    </div>
  </li>
  <li data-rid="2">
    <div class="book-mid-info">
      <h2><a data-bid="1032768092" href="//www.qidian.com/book/1032768092/">在美漫当心灵导师的日子</a></h2>
      <p class="author"><a class="name" href="//my.qidian.com/author/9/">遇牧烧绳</a></p>
    </div>
  </li>
  <li data-rid="3">
    <div class="book-mid-info">
      <h2><a data-bid="1032768092" href="//www.qidian.com/book/1032768092/">dup should be skipped</a></h2>
    </div>
  </li>
</ul></div></body></html>
"""


def test_parse():
    rows = qcs.parse_qidian_chart(FIXTURE)
    assert len(rows) == 2  # duplicate bid skipped
    assert rows[0] == {"position": 1, "bid": 1009817672,
                       "title": "轮回乐园", "author": "那一只蚊子"}
    assert rows[1]["position"] == 2
    assert rows[1]["bid"] == 1032768092
    assert rows[1]["author"] == "遇牧烧绳"


def test_url_builder():
    b = qcs.build_qidian_chart_url
    assert b("hotsales", "overall", 1) == "https://www.qidian.com/rank/hotsales/"
    assert b("hotsales", "overall", 3) == "https://www.qidian.com/rank/hotsales/page3/"
    assert b("yuepiao", "chn21", 1) == "https://www.qidian.com/rank/yuepiao/chn21/"
    assert b("yuepiao", "chn21", 2) == "https://www.qidian.com/rank/yuepiao/chn21/page2/"


def test_taxonomy():
    assert set(qcs.QIDIAN_RANK_TYPES) == {
        "yuepiao", "hotsales", "recom", "collect", "readindex", "vipup"}
    assert qcs.QIDIAN_GENRE_CHANNELS["overall"] is None
    assert qcs.QIDIAN_GENRE_CHANNELS["chn21"] == 21
    assert len(qcs.QIDIAN_GENRE_CHANNELS) == 15  # overall + 14 genres
    assert qcs.QIDIAN_CHART_PAGES == [1, 2, 3, 4, 5]


if __name__ == "__main__":
    test_parse()
    test_url_builder()
    test_taxonomy()
    print("OK test_qidian_charts")
