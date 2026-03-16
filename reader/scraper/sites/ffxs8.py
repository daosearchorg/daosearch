"""ffxs8.com scraper — adapted for httpx + Google Translate proxy."""

from __future__ import annotations

import re
from urllib.parse import urljoin

from scraper.base import BaseScraper
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://www.ffxs8.com"

SPAM_PATTERNS = ["ffxs8", "分飞小说"]


class Ffxs8Scraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        return bool(re.search(r"ffxs8\.com/\w+/\d+(?:\.html)?/?$", url))

    def _extract_ids(self, url: str) -> tuple[str, str]:
        match = re.search(r"/(\w+)/(\d+)", url)
        if not match:
            raise ValueError(f"Cannot extract IDs from {url}")
        return match.group(1), match.group(2)

    async def scrape_novel_data(self, url: str) -> NovelData:
        cat, book_id = self._extract_ids(url)
        page_url = f"{BASE_URL}/{cat}/{book_id}.html"
        html = await self._fetch(page_url, encoding="gbk")
        tree = self._parse(html)

        raw_title = self._text(tree, "div.detail h1") or self._text(tree, "h1")
        title = re.sub(r"\s*[（(]全本[）)]\s*$", "", raw_title).strip()

        author = ""
        author_el = tree.cssselect("p.author span")
        if author_el:
            text = author_el[0].text_content().strip()
            author = re.sub(r"^作者[：:]", "", text).strip()

        description = self._text(tree, ".descInfo p")
        status = "completed" if "全本" in raw_title else ""

        image_url = ""
        for el in tree.cssselect("div.cover img"):
            src = el.get("src", "")
            if src and "notimg" not in src:
                image_url = urljoin(BASE_URL, src)
                break

        return NovelData(
            title=title, author=author, status=status,
            description=description, novel_url=url, image_url=image_url,
        )

    async def get_chapter_urls(self, novel_url: str) -> list[ChapterEntry]:
        cat, book_id = self._extract_ids(novel_url)
        page_url = f"{BASE_URL}/{cat}/{book_id}.html"
        html = await self._fetch(page_url, encoding="gbk")
        tree = self._parse(html)

        entries: list[ChapterEntry] = []
        seen: set[str] = set()
        for a in tree.cssselect(".catalog ul li a"):
            href = a.get("href", "")
            if not href or href == "#":
                continue
            original_url = self._unwrap_gt_href(href, BASE_URL)
            if not original_url or original_url in seen:
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
        html = await self._fetch(url, encoding="gbk")
        tree = self._parse(html)

        title = self._text(tree, "div.article h1") or self._text(tree, "h1")

        content_el = tree.cssselect("div.content")
        if not content_el:
            return ChapterContent(title=title, content="", chapter_url=url)

        container = content_el[0]
        for bad in container.cssselect("script, style, ins, div.ad"):
            if bad.getparent() is not None:
                bad.getparent().remove(bad)

        paragraphs = container.cssselect("p")
        if paragraphs:
            parts = [p.text_content().strip() for p in paragraphs if p.text_content().strip()]
            content = "\n".join(parts)
        else:
            content = container.text_content().strip()

        lines = content.split("\n")
        lines = [ln.strip() for ln in lines]
        lines = [ln for ln in lines if ln and not any(s in ln for s in SPAM_PATTERNS)]
        return ChapterContent(title=title, content="\n".join(lines), chapter_url=url)
