"""book.qq.com scraper — direct fetch, no GT proxy needed."""

from __future__ import annotations

import json
import re
from urllib.parse import urljoin

from scraper.base import BaseScraper
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://book.qq.com"

# CTA text that appears on VIP chapters when content is truncated
VIP_CTA = "上QQ阅读APP看后续精彩内容"


class BookQQScraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        return bool(re.search(r"book\.qq\.com/book-detail/\d+", url))

    def _extract_book_id(self, url: str) -> str:
        match = re.search(r"/(book-detail|book-read)/(\d+)", url)
        if not match:
            raise ValueError(f"Cannot extract book ID from {url}")
        return match.group(2)

    def _extract_nuxt_data(self, html: str) -> dict:
        """Extract window.__NUXT__ data from the HTML."""
        # Nuxt embeds state as window.__NUXT__={...} in a script tag
        match = re.search(r"window\.__NUXT__\s*=\s*(\{.+?\})\s*;?\s*</script>", html, re.DOTALL)
        if not match:
            return {}
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            return {}

    async def scrape_novel_data(self, url: str) -> NovelData:
        book_id = self._extract_book_id(url)
        page_url = f"{BASE_URL}/book-detail/{book_id}"
        html = await self._fetch(page_url, use_gt=False)
        tree = self._parse(html)

        title = self._meta(tree, "og:title") or self._text(tree, "h1")
        author = self._meta(tree, "og:novel:author") or ""
        status = self._meta(tree, "og:novel:status") or ""
        description = self._meta(tree, "og:description") or ""

        img_els = tree.cssselect("img.book-cover, .book-cover img")
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
        book_id = self._extract_book_id(novel_url)
        page_url = f"{BASE_URL}/book-detail/{book_id}"
        html = await self._fetch(page_url, use_gt=False)
        tree = self._parse(html)

        link_els = tree.cssselect("ul.book-dir li.list a")

        entries: list[ChapterEntry] = []
        seen: set[str] = set()
        for el in link_els:
            href = el.get("href", "")
            if not href:
                continue
            if href.startswith("//"):
                href = f"https:{href}"
            elif href.startswith("/"):
                href = urljoin(BASE_URL, href)

            if href in seen:
                continue
            seen.add(href)

            name_el = el.cssselect("span.name")
            title = name_el[0].text_content().strip() if name_el else el.text_content().strip()

            # Check if this chapter is locked
            parent_li = el.getparent()
            is_locked = bool(parent_li is not None and parent_li.cssselect("i.lock"))

            entries.append(ChapterEntry(
                title=title,
                url=href,
                sequence=0,
            ))

        # Chapters come in reverse order on the page, second <ul> is ascending
        # Just assign sequence based on order
        for i, entry in enumerate(entries):
            entry.sequence = i + 1
        return entries

    async def scrape_chapter(self, url: str) -> ChapterContent:
        html = await self._fetch(url, use_gt=False)

        # Try extracting from window.__NUXT__ data
        nuxt_data = self._extract_nuxt_data(html)
        title = ""
        content = ""
        vip = False

        if nuxt_data:
            # Navigate Nuxt data structure
            data_list = nuxt_data.get("data", [])
            for item in data_list:
                if isinstance(item, dict):
                    current = item.get("currentContent", {})
                    if current:
                        title = current.get("chapterTitle", "")
                        raw_content = current.get("content", "")
                        total_words = current.get("totalWords", 0)

                        # Clean HTML tags from content
                        content = re.sub(r"<[^>]+>", "\n", raw_content)
                        content = content.strip()

                        # Detect VIP: content significantly shorter than totalWords
                        if total_words and len(content) < total_words * 0.5:
                            vip = True
                        break

        # Fallback: parse from DOM
        if not content:
            tree = self._parse(html)
            title = title or self._text(tree, "h1")
            content_el = tree.cssselect(".chapter-content, .chapterContent, .read-content")
            if content_el:
                content = content_el[0].text_content().strip()

        # Check for VIP CTA text
        if VIP_CTA in content:
            content = content.split(VIP_CTA)[0].strip()
            vip = True
        if VIP_CTA in html:
            vip = True

        # Clean up
        lines = content.split("\n")
        lines = [ln.strip() for ln in lines if ln.strip()]

        return ChapterContent(
            title=title,
            content="\n".join(lines),
            chapter_url=url,
            vip=vip,
        )
