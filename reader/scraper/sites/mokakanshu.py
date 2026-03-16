"""mokakanshu.vip scraper — adapted for httpx + Google Translate proxy.

Chapters may be paginated (_2.html, _3.html sub-pages) — scraper follows them.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

from scraper.base import BaseScraper
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://mokakanshu.vip"

SPAM_PATTERNS = ["mokakanshu", "墨卡看书", "莫卡看书"]


class MokakanshuScraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        return bool(re.search(r"mokakanshu\.vip/book/\d+/?$", url))

    def _extract_book_id(self, url: str) -> str:
        match = re.search(r"/book/(\d+)", url)
        if not match:
            raise ValueError(f"Cannot extract book ID from {url}")
        return match.group(1)

    async def scrape_novel_data(self, url: str) -> NovelData:
        book_id = self._extract_book_id(url)
        page_url = f"{BASE_URL}/book/{book_id}/"
        html = await self._fetch(page_url)
        tree = self._parse(html)

        title = self._meta(tree, "og:novel:book_name") or self._text(tree, "h1.novel_title") or self._text(tree, "h1")
        author = self._meta(tree, "og:novel:author") or ""
        status = self._meta(tree, "og:novel:status") or ""

        desc_els = tree.cssselect("div.m-desc, div.desc.m-desc")
        description = desc_els[0].text_content().strip() if desc_els else ""

        image_url = ""
        for el in tree.cssselect("div.imgbox img, div.detail-box img"):
            src = el.get("src", "")
            if src and "nocover" not in src:
                image_url = src if src.startswith("http") else urljoin(BASE_URL, src)
                break

        return NovelData(
            title=title, author=author, status=status,
            description=description, novel_url=url, image_url=image_url,
        )

    async def get_chapter_urls(self, novel_url: str) -> list[ChapterEntry]:
        book_id = self._extract_book_id(novel_url)
        page_url = f"{BASE_URL}/book/{book_id}/"
        html = await self._fetch(page_url)
        tree = self._parse(html)

        # Use the last section-list (full chapter list, not "latest" snippet)
        all_lists = tree.cssselect("ul.section-list")
        target_list = all_lists[-1] if all_lists else None
        if target_list is None:
            return []

        entries: list[ChapterEntry] = []
        seen: set[str] = set()
        for a in target_list.cssselect("li a[href]"):
            href = a.get("href", "")
            if not href or href == "#":
                continue
            original_url = self._unwrap_gt_href(href, BASE_URL)
            if not original_url or not re.search(r"/book/\d+/\d+\.html", original_url):
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

        raw_title = self._text(tree, "h1.title") or self._text(tree, "h1")
        title = re.sub(r"\s*[（(]\d+\s*/\s*\d+[）)]\s*$", "", raw_title).strip()

        paragraphs = self._extract_content(tree)

        # Follow sub-page pagination (_2.html, _3.html)
        while True:
            next_el = tree.cssselect("a#next_url")
            if not next_el:
                break
            next_href = next_el[0].get("href", "")
            if not next_href:
                break
            next_full = self._unwrap_gt_href(next_href, BASE_URL) or (next_href if next_href.startswith("http") else urljoin(BASE_URL, next_href))
            # Only follow sub-pages, not next chapter
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
        content_el = tree.cssselect("div.content#content, div#content")
        if not content_el:
            return []
        container = content_el[0]

        for bad in container.cssselect("script, style, ins, div.ad, div[style], a[href='javascript:report()']"):
            if bad.getparent() is not None:
                bad.getparent().remove(bad)
        for a in container.cssselect("a[rel='next'], a[href*='_']"):
            if a.getparent() is not None:
                a.getparent().remove(a)

        parts: list[str] = []
        for p in container.cssselect("p"):
            text = p.text_content().strip()
            if text and "本章未完" not in text and "举报本章" not in text:
                parts.append(text)

        if not parts:
            text = container.text_content().strip()
            if text:
                parts = [text]

        return parts
