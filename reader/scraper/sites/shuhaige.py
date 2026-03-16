"""shuhaige.net scraper — adapted for httpx + Google Translate proxy.

Chapters may be paginated (_2.html, _3.html sub-pages).
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

from scraper.base import BaseScraper
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://www.shuhaige.net"

SPAM_PATTERNS = [
    "小主，这个章节后面还有哦",
    "请点击下一页继续阅读",
    "后面更精彩",
    "shuhaige",
    "书海阁",
]


class ShuhaigeScraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        return bool(re.search(r"shuhaige\.net/(shu_\d+\.html|\d+/$)", url))

    def _extract_book_id(self, url: str) -> str:
        match = re.search(r"/(?:shu_)?(\d+)(?:[_/.])", url)
        if not match:
            raise ValueError(f"Cannot extract book ID from {url}")
        return match.group(1)

    async def scrape_novel_data(self, url: str) -> NovelData:
        book_id = self._extract_book_id(url)
        info_url = f"{BASE_URL}/shu_{book_id}.html"
        html = await self._fetch(info_url)
        tree = self._parse(html)

        title = self._meta(tree, "og:novel:book_name") or self._text(tree, "div.booktitle h1")
        author = self._meta(tree, "og:novel:author") or self._text(tree, "#author a")
        status = self._meta(tree, "og:novel:status") or ""
        description = self._text(tree, "#bookintro p")

        og_image = self._meta(tree, "og:image")
        image_url = og_image or ""
        if not image_url:
            for el in tree.cssselect("#bookimg img"):
                src = el.get("src", "")
                if src:
                    image_url = urljoin(BASE_URL, src)
                    break

        return NovelData(
            title=title, author=author, status=status,
            description=description, novel_url=url, image_url=image_url,
        )

    async def get_chapter_urls(self, novel_url: str) -> list[ChapterEntry]:
        book_id = self._extract_book_id(novel_url)
        index_url = f"{BASE_URL}/{book_id}/"
        html = await self._fetch(index_url)
        tree = self._parse(html)

        entries: list[ChapterEntry] = []
        seen: set[str] = set()
        for a in tree.cssselect("div#list dd a"):
            href = a.get("href", "")
            if not href:
                continue
            original_url = self._unwrap_gt_href(href, BASE_URL)
            if not original_url or not re.search(rf"/{book_id}/\d+\.html", original_url):
                continue
            if original_url in seen:
                continue
            seen.add(original_url)

            raw_title = a.text_content().strip()
            clean_title = re.sub(r"^第[\d一二三四五六七八九十百千萬]+章\s*", "", raw_title).strip() or raw_title
            entries.append(ChapterEntry(
                title=clean_title,
                url=original_url,
                sequence=len(entries) + 1,
            ))

        return entries

    async def scrape_chapter(self, url: str) -> ChapterContent:
        html = await self._fetch(url)
        tree = self._parse(html)

        title = self._text(tree, "div.bookname h1")
        paragraphs = self._extract_content(tree)

        # Follow sub-page pagination (_2.html, _3.html)
        while True:
            next_els = tree.cssselect("#pager_next")
            if not next_els:
                break
            next_href = next_els[0].get("href", "")
            if not next_href:
                break
            next_full = self._unwrap_gt_href(next_href, BASE_URL) or urljoin(BASE_URL, next_href)
            if "_" not in next_full.split("/")[-1]:
                break
            try:
                next_html = await self._fetch(next_full)
                tree = self._parse(next_html)
                paragraphs.extend(self._extract_content(tree))
            except Exception:
                break

        lines = [ln for ln in paragraphs if not any(s in ln for s in SPAM_PATTERNS)]
        return ChapterContent(title=title, content="\n".join(lines), chapter_url=url)

    def _extract_content(self, tree) -> list[str]:
        content_el = tree.cssselect("div#content")
        if not content_el:
            return []
        parts: list[str] = []
        for p in content_el[0].cssselect("p"):
            text = p.text_content().strip()
            if text:
                parts.append(text)
        return parts
