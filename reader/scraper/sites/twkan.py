"""twkan.com scraper — adapted for httpx + Google Translate proxy."""

from __future__ import annotations

import re
from urllib.parse import urljoin

from scraper.base import BaseScraper
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://twkan.com"

SPAM_PATTERNS = ["twkan", "天問看書"]


class TwkanScraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        return bool(re.search(r"twkan\.com/(book|ajax_novels/chapterlist)/\d+", url))

    def _extract_book_id(self, url: str) -> str:
        match = re.search(r"twkan\.com/(?:book|txt|ajax_novels/chapterlist)/(\d+)", url)
        if not match:
            raise ValueError(f"Cannot extract book ID from {url}")
        return match.group(1)

    async def scrape_novel_data(self, url: str) -> NovelData:
        book_id = self._extract_book_id(url)
        page_url = f"{BASE_URL}/book/{book_id}.html"
        html = await self._fetch(page_url)
        tree = self._parse(html)

        title_el = tree.cssselect(".booknav2 h1 a")
        title = title_el[0].text_content().strip() if title_el else self._text(tree, "h1")

        author_els = tree.cssselect(".booknav2 p a[href*='author']")
        author = author_els[0].text_content().strip() if author_els else ""

        status = ""
        status_els = tree.cssselect(".booknav2 p:nth-of-type(3)")
        if status_els:
            text = status_els[0].text_content().strip()
            if "連載" in text:
                status = "ongoing"
            elif "完結" in text:
                status = "completed"

        desc_els = tree.cssselect(".navtxt p")
        desc_parts = [el.text_content().strip() for el in desc_els if el.text_content().strip()]
        description = "\n".join(desc_parts)
        if "小說關鍵詞" in description:
            description = description[:description.index("小說關鍵詞")].strip()

        img_els = tree.cssselect(".bookimg2 img")
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
        ajax_url = f"{BASE_URL}/ajax_novels/chapterlist/{book_id}.html"
        html = await self._fetch(ajax_url)
        tree = self._parse(html)

        entries: list[ChapterEntry] = []
        seen: set[str] = set()
        order: list[tuple[int, ChapterEntry]] = []

        for li in tree.cssselect("ul li"):
            data_num = li.get("data-num", "")
            a = li.cssselect("a")
            if not a:
                continue
            href = a[0].get("href", "")
            if not href or href == "#":
                continue
            original_url = self._unwrap_gt_href(href, BASE_URL)
            if not original_url:
                continue
            if original_url in seen:
                continue
            seen.add(original_url)

            raw_title = a[0].text_content().strip()
            clean_title = re.sub(r"^第[\d一二三四五六七八九十百千萬]+章\s*", "", raw_title).strip() or raw_title

            try:
                num = int(data_num) if data_num else len(order)
            except ValueError:
                num = len(order)

            entry = ChapterEntry(title=clean_title, url=original_url, sequence=0)
            order.append((num, entry))

        # Sort by data-num for correct order
        order.sort(key=lambda x: x[0])
        for i, (_, entry) in enumerate(order):
            entry.sequence = i + 1
            entries.append(entry)

        return entries

    async def scrape_chapter(self, url: str) -> ChapterContent:
        html = await self._fetch(url)
        tree = self._parse(html)

        title = self._text(tree, "h1")

        content_el = tree.cssselect("#txtcontent0")
        if not content_el:
            return ChapterContent(title=title, content="", chapter_url=url)

        container = content_el[0]
        for bad in container.cssselect("script, div.err_tips, div.txtad"):
            bad.getparent().remove(bad)

        content = container.text_content().strip()
        if title and content.startswith(title):
            content = content[len(title):].strip()
        content = content.rstrip("(本章完)").strip()

        lines = content.split("\n")
        lines = [ln.strip() for ln in lines]
        lines = [ln for ln in lines if ln and not any(s in ln for s in SPAM_PATTERNS)]
        return ChapterContent(title=title, content="\n".join(lines), chapter_url=url)
