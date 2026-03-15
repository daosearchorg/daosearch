"""69shuba.tw scraper — adapted for the reader service.

Similar to 69shuba.com but different URL structure:
- Novel page: /book/{id}/
- Chapter index: /indexlist/{id}/
- Chapter page: /read/{id}/{chapter}
- Encoding: UTF-8 (not GBK like .com)
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

from scraper.base import BaseScraper
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://69shuba.tw"

SPAM_PATTERNS = ["69shuba", "69書吧", "69书吧"]


class Shuba69TwScraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        return bool(re.search(r"69shuba\.tw/book/\d+/?$", url))

    def _extract_book_id(self, url: str) -> str:
        match = re.search(r"/(book|read|indexlist)/(\d+)", url)
        if not match:
            raise ValueError(f"Cannot extract book ID from {url}")
        return match.group(2)

    async def scrape_novel_data(self, url: str) -> NovelData:
        book_id = self._extract_book_id(url)
        page_url = f"{BASE_URL}/book/{book_id}/"
        html = await self._fetch(page_url)
        tree = self._parse(html)

        title = self._meta(tree, "og:novel:book_name") or self._text(tree, ".bookinfo h1")
        author = self._meta(tree, "og:novel:author")
        if not author:
            author_els = tree.cssselect(".bookinfo .info a[href*='/author/']")
            author = author_els[0].text_content().strip() if author_els else ""
        status = self._meta(tree, "og:novel:status") or ""
        description = self._text(tree, ".intro p") or self._text(tree, ".intro")

        image_url = ""
        og_image = self._meta(tree, "og:image")
        if og_image:
            image_url = og_image if og_image.startswith("http") else f"https:{og_image}"

        return NovelData(
            title=title, author=author, status=status,
            description=description, novel_url=url, image_url=image_url,
        )

    async def get_chapter_urls(self, novel_url: str) -> list[ChapterEntry]:
        book_id = self._extract_book_id(novel_url)

        # Try index page first
        index_url = f"{BASE_URL}/indexlist/{book_id}/"
        html = await self._fetch(index_url)
        tree = self._parse(html)

        entries: list[ChapterEntry] = []
        seen: set[str] = set()

        # Collect from all pages — first page
        self._collect_chapters(tree, entries, seen)

        # Check for pagination
        page_urls: list[str] = []
        for option in tree.cssselect("#indexselect-top option, select option"):
            val = option.get("value", "")
            if val:
                full = val if val.startswith("http") else urljoin(BASE_URL, val)
                if full != index_url and full not in page_urls:
                    page_urls.append(full)

        # Fetch remaining pages
        for purl in page_urls:
            try:
                page_html = await self._fetch(purl)
                page_tree = self._parse(page_html)
                before = len(entries)
                self._collect_chapters(page_tree, entries, seen)
                if len(entries) - before < 100:
                    break  # Last page
            except Exception:
                break

        # If index failed, fallback to book page
        if not entries:
            book_url = f"{BASE_URL}/book/{book_id}/"
            book_html = await self._fetch(book_url)
            book_tree = self._parse(book_html)
            for a in book_tree.cssselect("ul.last9 li a[href*='read']"):
                href = a.get("href", "")
                if not href:
                    continue
                original_url = self._unwrap_gt_href(href, BASE_URL)
                if not original_url or "/read/" not in original_url:
                    continue
                if original_url in seen:
                    continue
                seen.add(original_url)
                raw_title = a.text_content().strip()
                title = re.sub(r"^第\d+章\s*", "", raw_title).strip() or raw_title
                entries.append(ChapterEntry(title=title, url=original_url, sequence=0))
            entries.reverse()

        for i, entry in enumerate(entries):
            entry.sequence = i + 1
        return entries

    def _collect_chapters(self, tree, entries: list[ChapterEntry], seen: set[str]) -> None:
        for a in tree.cssselect("ul.last9 li a[href*='read']"):
            href = a.get("href", "")
            if not href or href == "#":
                continue
            # Unwrap GT proxy URLs back to originals
            original_url = self._unwrap_gt_href(href, BASE_URL)
            if not original_url or "/read/" not in original_url:
                continue
            full = original_url
            if full in seen:
                continue
            seen.add(full)
            raw_title = a.text_content().strip()
            title = re.sub(r"^第\d+章\s*", "", raw_title).strip() or raw_title
            entries.append(ChapterEntry(title=title, url=full, sequence=0))

    async def scrape_chapter(self, url: str) -> ChapterContent:
        html = await self._fetch(url)
        tree = self._parse(html)

        raw_title = self._text(tree, "h1.nr_title") or self._text(tree, "h1#nr_title") or self._text(tree, "h1")
        # Remove pagination suffix like "(1 / 1)"
        title = re.sub(r"\s*[（(]\d+\s*/\s*\d+[）)]\s*$", "", raw_title).strip()
        # Strip chapter number prefix
        title = re.sub(r"^第\d+章\s*", "", title).strip() or title

        content_el = tree.cssselect("div#nr1")
        if not content_el:
            return ChapterContent(title=title, content="", chapter_url=url)

        container = content_el[0]

        # Remove scripts, ads
        for bad in container.cssselect("script, style, ins, div.ad, h1"):
            if bad.getparent() is not None:
                bad.getparent().remove(bad)

        # Extract from <p> tags
        parts: list[str] = []
        for p in container.cssselect("p"):
            text = p.text_content().strip()
            if text:
                parts.append(text)

        # Fallback if no <p> tags
        if not parts:
            text = container.text_content().strip()
            if text:
                parts = [text]

        content = "\n".join(parts)
        content = content.rstrip("(本章完)").rstrip("（本章完）").strip()

        # Filter spam
        lines = content.split("\n")
        lines = [ln for ln in lines if not any(s in ln for s in SPAM_PATTERNS)]
        content = "\n".join(lines).strip()

        return ChapterContent(title=title, content=content, chapter_url=url)
