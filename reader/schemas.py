from pydantic import BaseModel


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str
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
    url: str
    sequence: int


class ChapterContent(BaseModel):
    title: str
    content: str
    chapter_url: str
