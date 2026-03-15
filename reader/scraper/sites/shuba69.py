"""69shuba.com scraper — adapted for httpx + Google Translate proxy."""

from __future__ import annotations

import re
from urllib.parse import urljoin

from scraper.base import BaseScraper
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://www.69shuba.com"

SPAM_PATTERNS = ["最新小说", "⊥", "69shuba", "69书吧"]


class Shuba69Scraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        return bool(re.search(r"69shuba\.(com|tw)/book/\d+", url))

    def _extract_book_id(self, url: str) -> str:
        match = re.search(r"/(book|txt)/(\d+)", url)
        if not match:
            raise ValueError(f"Cannot extract book ID from {url}")
        return match.group(2)

    def _novel_page_url(self, url: str) -> str:
        return f"{BASE_URL}/book/{self._extract_book_id(url)}.htm"

    def _chapter_index_url(self, url: str) -> str:
        return f"{BASE_URL}/book/{self._extract_book_id(url)}/"

    async def scrape_novel_data(self, url: str) -> NovelData:
        html = await self._fetch(self._novel_page_url(url), encoding="gbk")
        tree = self._parse(html)

        title = self._meta(tree, "og:title") or self._meta(tree, "og:novel:book_name")
        if not title:
            title = self._text(tree, "div.booknav2 h1")

        author = self._meta(tree, "og:novel:author")
        if not author:
            els = tree.cssselect("div.booknav2 p a[href*='author']")
            author = els[0].text_content().strip() if els else ""

        status = self._meta(tree, "og:novel:status") or ""

        desc_els = tree.cssselect("div.navtxt p")
        desc_parts = [el.text_content().strip() for el in desc_els if el.text_content().strip()]
        description = "\n".join(desc_parts)
        if "小说关键词" in description:
            description = description[:description.index("小说关键词")].strip()

        img_els = tree.cssselect("div.bookimg2 img")
        image_url = ""
        for el in img_els:
            src = el.get("src", "")
            if src:
                image_url = urljoin(BASE_URL, src)
                break

        return NovelData(
            title=title, author=author, status=status,
            description=description, novel_url=url, image_url=image_url,
        )

    async def get_chapter_urls(self, novel_url: str) -> list[ChapterEntry]:
        html = await self._fetch(self._chapter_index_url(novel_url), encoding="gbk")
        tree = self._parse(html)

        link_els = tree.cssselect(".catalog ul li a, #catalog ul li a, .qustime ul li a")

        entries: list[ChapterEntry] = []
        seen: set[str] = set()
        for el in link_els:
            href = el.get("href", "")
            if not href or href == "#":
                continue
            original_url = self._unwrap_gt_href(href, BASE_URL)
            if not original_url or "/txt/" not in original_url:
                continue
            if original_url not in seen:
                seen.add(original_url)
                entries.append(ChapterEntry(
                    title=el.text_content().strip(),
                    url=original_url,
                    sequence=0,
                ))

        entries.reverse()
        for i, entry in enumerate(entries):
            entry.sequence = i + 1
        return entries

    async def scrape_chapter(self, url: str) -> ChapterContent:
        html = await self._fetch(url, encoding="gbk")
        tree = self._parse(html)

        title = self._text(tree, "h1.hide720") or self._text(tree, "h1")

        content_el = tree.cssselect("div.txtnav") or tree.cssselect("div#chaptercontent")
        if not content_el:
            return ChapterContent(title=title, content="", chapter_url=url)

        container = content_el[0]
        for bad in container.cssselect("script, .bottom-ad, .txtright, .txtinfo, .contentadv, h1"):
            bad.getparent().remove(bad)

        content = container.text_content().strip()
        if title and content.startswith(title):
            content = content[len(title):].strip()
        content = content.rstrip("(本章完)").strip()

        lines = content.split("\n")
        lines = [ln.strip() for ln in lines]
        lines = [ln for ln in lines if ln and not any(s in ln for s in SPAM_PATTERNS)]
        return ChapterContent(title=title, content="\n".join(lines), chapter_url=url)
