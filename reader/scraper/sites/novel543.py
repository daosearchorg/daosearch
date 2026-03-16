"""novel543.com scraper — adapted for httpx + Google Translate proxy."""

from __future__ import annotations

import re
from urllib.parse import urljoin

from scraper.base import BaseScraper
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://www.novel543.com"

SPAM_PATTERNS = ["novel543", "稷下書院"]


class Novel543Scraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        # /0523685336/ or /0523685336/dir
        return bool(re.search(r"novel543\.com/\d+/(dir)?$", url))

    def _extract_book_id(self, url: str) -> str:
        match = re.search(r"novel543\.com/(\d+)", url)
        if not match:
            raise ValueError(f"Cannot extract book ID from {url}")
        return match.group(1)

    async def scrape_novel_data(self, url: str) -> NovelData:
        book_id = self._extract_book_id(url)
        info_url = f"{BASE_URL}/{book_id}/"
        html = await self._fetch(info_url)
        tree = self._parse(html)

        title = self._text(tree, "h1")

        author_el = tree.cssselect("p.author")
        author = ""
        if author_el:
            text = author_el[0].text_content().strip()
            author = text.split("分類")[0].strip()

        description = self._text(tree, "div.intro")

        status = ""
        status_spans = tree.cssselect("span.i-time")
        if status_spans:
            status = status_spans[0].text_content().strip()

        cover_els = tree.cssselect("div.cover img")
        image_url = ""
        for el in cover_els:
            src = el.get("src", "")
            if src:
                image_url = src
                break

        return NovelData(
            title=title, author=author, status=status,
            description=description, novel_url=url, image_url=image_url,
        )

    async def get_chapter_urls(self, novel_url: str) -> list[ChapterEntry]:
        book_id = self._extract_book_id(novel_url)
        dir_url = f"{BASE_URL}/{book_id}/dir"
        html = await self._fetch(dir_url)
        tree = self._parse(html)

        entries: list[ChapterEntry] = []
        seen: set[str] = set()
        for a in tree.cssselect("div.chaplist a"):
            href = a.get("href", "")
            if not href:
                continue
            original_url = self._unwrap_gt_href(href, BASE_URL)
            if not original_url or not re.search(rf"/{book_id}/\d+_\d+\.html", original_url):
                continue
            if original_url in seen:
                continue
            seen.add(original_url)
            raw_title = a.text_content().strip()
            clean_title = re.sub(r"^第[\d一二三四五六七八九十百千萬]+章\s*", "", raw_title).strip() or raw_title
            entries.append(ChapterEntry(
                title=clean_title,
                url=original_url,
                sequence=0,
            ))

        # Dir page shows newest first, reverse for ascending order
        entries.reverse()
        for i, entry in enumerate(entries):
            entry.sequence = i + 1
        return entries

    async def scrape_chapter(self, url: str) -> ChapterContent:
        html = await self._fetch(url)
        tree = self._parse(html)

        title = self._text(tree, "h1")

        content_el = tree.cssselect("div.content")
        if not content_el:
            return ChapterContent(title=title, content="", chapter_url=url)

        container = content_el[0]
        for bad in container.cssselect("script, .ad, .ads"):
            bad.getparent().remove(bad)

        content = container.text_content().strip()
        if title and content.startswith(title):
            content = content[len(title):].strip()

        lines = content.split("\n")
        lines = [ln.strip() for ln in lines]
        lines = [ln for ln in lines if ln and not any(s in ln for s in SPAM_PATTERNS)]
        return ChapterContent(title=title, content="\n".join(lines), chapter_url=url)
