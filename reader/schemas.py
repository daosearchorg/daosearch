from pydantic import BaseModel


class SearchResult(BaseModel):
    title: str
    title_en: str = ""
    url: str
    snippet: str
    snippet_en: str = ""
    domain: str


class NovelData(BaseModel):
    title: str
    author: str
    status: str
    description: str
    novel_url: str
    image_url: str = ""


class ChapterEntry(BaseModel):
    title: str
    title_en: str = ""
    url: str
    sequence: int


class ChapterContent(BaseModel):
    title: str
    content: str
    chapter_url: str
    vip: bool = False
