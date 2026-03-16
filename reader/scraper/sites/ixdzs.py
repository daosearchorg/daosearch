"""ixdzs8.com scraper — adapted for httpx + Google Translate proxy.

Chapter pages use a JS token challenge: first request returns a small page
with a base64 token, second request with ?challenge={token} returns content.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

import httpx

from scraper.base import BaseScraper, HEADERS
from schemas import NovelData, ChapterEntry, ChapterContent

BASE_URL = "https://ixdzs8.com"

SPAM_PATTERNS = ["ixdzs", "爱下电子书"]


class IxdzsScraper(BaseScraper):

    def is_novel_url(self, url: str) -> bool:
        return bool(re.search(r"ixdzs8\.com/read/\d+/?$", url))

    def _extract_book_id(self, url: str) -> str:
        match = re.search(r"/read/(\d+)", url)
        if not match:
            raise ValueError(f"Cannot extract book ID from {url}")
        return match.group(1)

    async def _fetch_chapter(self, url: str) -> str:
        """Two-step fetch for chapter pages with JS token challenge."""
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=HEADERS) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text

            # Check for challenge token
            token_match = re.search(r'let\s+token\s*=\s*["\']([A-Za-z0-9+/=]+)["\']', html)
            if not token_match:
                if "page-content" in html or "page-d-name" in html:
                    return html
                # Fall back to GT proxy
                return await self._fetch(url)

            token = token_match.group(1)
            separator = "&" if "?" in url else "?"
            resp2 = await client.get(f"{url}{separator}challenge={token}")
            resp2.raise_for_status()
            return resp2.text

    async def scrape_novel_data(self, url: str) -> NovelData:
        book_id = self._extract_book_id(url)
        page_url = f"{BASE_URL}/read/{book_id}/"
        html = await self._fetch(page_url)
        tree = self._parse(html)

        title = self._meta(tree, "og:novel:book_name") or self._text(tree, "div.n-text h1")
        author = self._meta(tree, "og:novel:author") or self._text(tree, "a.bauthor")
        status = self._meta(tree, "og:novel:status") or self._text(tree, "span.end")
        description = self._text(tree, "p#intro")

        image_url = ""
        for el in tree.cssselect("div.n-img img"):
            src = el.get("src", "")
            if src:
                image_url = urljoin(BASE_URL, src)
                break

        return NovelData(
            title=title, author=author, status=status,
            description=description, novel_url=url, image_url=image_url,
        )

    async def get_chapter_urls(self, novel_url: str) -> list[ChapterEntry]:
        """Get chapters via AJAX POST to /novel/clist/."""
        book_id = self._extract_book_id(novel_url)

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{BASE_URL}/novel/clist/",
                data={"bid": book_id},
            )
            resp.raise_for_status()
            data = resp.json()

        if data.get("rs") != 200:
            return []

        entries: list[ChapterEntry] = []
        seq = 0
        for ch in data.get("data", []):
            if str(ch.get("ctype")) == "1":
                continue
            ordernum = ch.get("ordernum")
            if not ordernum:
                continue
            seq += 1
            title = ch.get("cname", "") or f"Chapter {seq}"
            title = re.sub(r"^第[\d一二三四五六七八九十百千萬]+章\s*", "", title).strip() or title
            entries.append(ChapterEntry(
                title=title,
                url=f"{BASE_URL}/read/{book_id}/p{ordernum}.html",
                sequence=seq,
            ))

        return entries

    async def scrape_chapter(self, url: str) -> ChapterContent:
        html = await self._fetch_chapter(url)
        tree = self._parse(html)

        title = self._text(tree, "h1.page-d-name")

        parts: list[str] = []
        for p in tree.cssselect("article.page-content section p"):
            classes = p.get("class", "")
            if "abg" in classes:
                continue
            text = p.text_content().strip()
            if text and not any(s in text for s in SPAM_PATTERNS):
                parts.append(text)

        return ChapterContent(title=title, content="\n".join(parts), chapter_url=url)
