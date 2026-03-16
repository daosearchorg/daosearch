"""trxs.cc scraper — adapted for httpx + Google Translate proxy."""

from __future__ import annotations

import re
from urllib.parse import urljoin

from scraper.base import BaseScraper
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://trxs.cc"

SPAM_PATTERNS = ["trxs", "同人社"]


class TrxsScraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        return bool(re.search(r"(trxs\.(cc|me)|tongrenshe\.cc)/tongren/\d+\.html", url))

    def _extract_book_id(self, url: str) -> str:
        match = re.search(r"/tongren/(\d+)", url)
        if not match:
            raise ValueError(f"Cannot extract book ID from {url}")
        return match.group(1)

    async def scrape_novel_data(self, url: str) -> NovelData:
        book_id = self._extract_book_id(url)
        page_url = f"{BASE_URL}/tongren/{book_id}.html"
        html = await self._fetch(page_url, encoding="gbk")
        tree = self._parse(html)

        title = self._text(tree, ".infos h1")

        author_els = tree.cssselect(".date span a")
        author = author_els[0].text_content().strip() if author_els else ""

        description = self._text(tree, ".infos > p")

        image_url = ""
        for el in tree.cssselect(".pic img"):
            src = el.get("src", "")
            if src:
                image_url = urljoin(BASE_URL, src)
                break

        return NovelData(
            title=title, author=author, status="",
            description=description, novel_url=url, image_url=image_url,
        )

    async def get_chapter_urls(self, novel_url: str) -> list[ChapterEntry]:
        book_id = self._extract_book_id(novel_url)
        page_url = f"{BASE_URL}/tongren/{book_id}.html"
        html = await self._fetch(page_url, encoding="gbk")
        tree = self._parse(html)

        entries: list[ChapterEntry] = []
        seen: set[str] = set()
        for a in tree.cssselect(".book_list ul li a"):
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

        title = self._text(tree, ".read_chapterName h1")

        content_el = tree.cssselect(".read_chapterDetail")
        if not content_el:
            return ChapterContent(title=title, content="", chapter_url=url)

        container = content_el[0]
        for bad in container.cssselect("script, div.ad, ins"):
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
