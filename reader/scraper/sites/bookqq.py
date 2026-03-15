"""book.qq.com scraper — direct fetch, no GT proxy needed."""

from __future__ import annotations

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

    def _extract_nuxt_content(self, html: str) -> tuple[str, str, int]:
        """Extract chapter title, content HTML, and totalWords from the NUXT data.

        The NUXT data is a JS function call, not JSON, so we extract fields with regex.
        Content is in a long string with <p> tags.
        """
        title = ""
        content_html = ""
        total_words = 0

        # Title: extract from <title> tag — format: "BookName_ChapterTitle在线阅读-QQ阅读"
        tm = re.search(r"<title>([^<]+)</title>", html)
        if tm:
            page_title = tm.group(1)
            # Extract chapter title part (after _ and before 在线阅读)
            parts = page_title.split("_", 1)
            if len(parts) > 1:
                ch_title = re.sub(r"在线阅读.*$", "", parts[1]).strip()
                title = ch_title if ch_title else parts[1].strip()
            else:
                title = page_title

        # Fallback: chapterTitle:"..." in NUXT data (when it's a literal string)
        if not title:
            m = re.search(r'chapterTitle:"([^"]*)"', html)
            if m:
                title = m.group(1)

        # totalWords
        m = re.search(r'totalWords:(\d+)', html)
        if m:
            total_words = int(m.group(1))

        # Content: find the longest string containing <p> tags (the chapter body)
        matches = re.findall(r'"([^"]{200,})"', html)
        for match in matches:
            if "<p>" in match and "data-v-" not in match[:20]:
                content_html = match
                break
            elif "<p>" in match:
                # Has data-v- prefix — strip it
                content_html = re.sub(r"^[^>]*>", "", match, count=1)
                break

        return title, content_html, total_words

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

        # There are two <ul class="book-dir"> — first is reverse (hidden), second is ascending
        # Use the last (ascending) list, fall back to all if only one
        all_uls = tree.cssselect("ul.book-dir")
        target_ul = all_uls[-1] if all_uls else tree
        link_els = target_ul.cssselect("li.list a")

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
            raw_title = name_el[0].text_content().strip() if name_el else el.text_content().strip()
            # Strip "第X章 " prefix — sequence number is shown separately
            title = re.sub(r"^第\d+章\s*", "", raw_title).strip() or raw_title

            # Check if this chapter is locked
            parent_li = el.getparent()
            is_locked = bool(parent_li is not None and parent_li.cssselect("i.lock"))

            entries.append(ChapterEntry(
                title=title,
                url=href,
                sequence=0,
            ))

        for i, entry in enumerate(entries):
            entry.sequence = i + 1
        return entries

    async def scrape_chapter(self, url: str) -> ChapterContent:
        html = await self._fetch(url, use_gt=False)

        title, content_html, total_words = self._extract_nuxt_content(html)
        content = ""
        vip = False

        if content_html:
            # Replace </p><p> boundaries with newlines
            text = re.sub(r"</p>\s*<p[^>]*>", "\n", content_html, flags=re.IGNORECASE)
            # Strip remaining HTML tags (complete and incomplete/trailing)
            text = re.sub(r"<[^>]+>", "", text)
            text = re.sub(r"<[^>]*$", "", text)
            # Clean up \r and excess whitespace
            content = text.replace("\r", "").strip()

            # Detect VIP: content significantly shorter than totalWords
            if total_words and len(content) < total_words * 0.5:
                vip = True

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
