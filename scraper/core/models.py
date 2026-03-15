from sqlalchemy import Boolean, Column, Integer, String, Text, ForeignKey, UniqueConstraint, CheckConstraint, Index, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import TIMESTAMP
from datetime import datetime, timezone
from .database import Base

def utc_now():
    """Return current UTC time for database defaults"""
    return datetime.now(timezone.utc)


# ============================================================================
# Core Tables
# ============================================================================

class Genre(Base):
    __tablename__ = 'genres'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    name_translated = Column(String(255), nullable=True)
    blacklisted = Column(Boolean, nullable=False, server_default='false')
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    books_as_genre = relationship("Book", back_populates="genre", foreign_keys="Book.genre_id")
    books_as_subgenre = relationship("Book", back_populates="subgenre", foreign_keys="Book.subgenre_id")

    __table_args__ = (
        # Covers the common JOIN + WHERE genres.blacklisted = false pattern
        Index('idx_genres_id_blacklisted', 'id', 'blacklisted'),
    )

    def __repr__(self):
        return f"<Genre(id={self.id}, name='{self.name}')>"


class Book(Base):
    __tablename__ = 'books'

    id = Column(Integer, primary_key=True, autoincrement=True)
    url = Column(String(500), nullable=False, unique=True, index=True)
    image_url = Column(String(500), nullable=True)
    title = Column(String(500), nullable=True)
    title_translated = Column(String(500), nullable=True)
    author = Column(String(255), nullable=True)
    author_translated = Column(String(255), nullable=True)
    update_time = Column(TIMESTAMP(timezone=True), nullable=True)
    synopsis = Column(Text, nullable=True)
    synopsis_translated = Column(Text, nullable=True)
    genre_id = Column(Integer, ForeignKey('genres.id', ondelete='SET NULL'), nullable=True)
    subgenre_id = Column(Integer, ForeignKey('genres.id', ondelete='SET NULL'), nullable=True)
    last_scraped_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    genre = relationship("Genre", back_populates="books_as_genre", foreign_keys=[genre_id])
    subgenre = relationship("Genre", back_populates="books_as_subgenre", foreign_keys=[subgenre_id])
    chapters = relationship("Chapter", back_populates="book", cascade="all, delete-orphan")
    ratings = relationship("BookRating", back_populates="book", cascade="all, delete-orphan")
    reviews = relationship("BookReview", back_populates="book", cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="book", cascade="all, delete-orphan")
    reading_progress = relationship("ReadingProgress", back_populates="book", cascade="all, delete-orphan")
    comments = relationship("BookComment", back_populates="book", cascade="all, delete-orphan")

    word_count = Column(Integer, nullable=True)
    status = Column(String(20), nullable=True)
    sex_attr = Column(Integer, nullable=True)
    qq_score = Column(String(10), nullable=True)
    qq_score_count = Column(Integer, nullable=True)
    qq_favorite_count = Column(Integer, nullable=True)
    qq_fan_count = Column(Integer, nullable=True)
    recommendation_qq_ids = Column(ARRAY(Integer), nullable=True)

    last_comments_scraped_at = Column(TIMESTAMP(timezone=True), nullable=True)
    qidian_id = Column(Integer, nullable=True, unique=True)
    qidiantu_url = Column(String(512), nullable=True)

    booklist_items = relationship("QidianBooklistItem", back_populates="book")

    __table_args__ = (
        Index('idx_books_genre_id', 'genre_id'),
        Index('idx_books_subgenre_id', 'subgenre_id'),
        Index('idx_books_updated_at', 'updated_at'),
        Index('idx_books_update_time', 'update_time'),
        Index('idx_books_title_trgm', 'title', postgresql_using='gin',
              postgresql_ops={'title': 'gin_trgm_ops'}),
        Index('idx_books_title_translated_trgm', 'title_translated', postgresql_using='gin',
              postgresql_ops={'title_translated': 'gin_trgm_ops'}),
        Index('idx_books_author_trgm', 'author', postgresql_using='gin',
              postgresql_ops={'author': 'gin_trgm_ops'}),
        Index('idx_books_author_translated_trgm', 'author_translated', postgresql_using='gin',
              postgresql_ops={'author_translated': 'gin_trgm_ops'}),
        # Library page: default sort by update_time for translated books
        Index('idx_books_translated_update_time', 'update_time',
              postgresql_where=text("title_translated IS NOT NULL")),
        Index('idx_books_translated_created_at', 'created_at',
              postgresql_where=text("title_translated IS NOT NULL")),
    )

    def __repr__(self):
        return f"<Book(id={self.id}, title='{self.title}', author='{self.author}')>"


class Chapter(Base):
    __tablename__ = 'chapters'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    sequence_number = Column(Integer, nullable=False)
    title = Column(String(500), nullable=True)
    title_translated = Column(String(500), nullable=True)
    url = Column(String(500), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    book = relationship("Book", back_populates="chapters")

    __table_args__ = (
        UniqueConstraint('book_id', 'sequence_number', name='uq_chapter_book_sequence'),
        Index('idx_chapters_book_id', 'book_id'),
        Index('idx_chapters_book_sequence', 'book_id', 'sequence_number'),
        Index('idx_chapters_url', 'url'),
        Index('idx_chapters_untranslated', 'book_id', 'title_translated', postgresql_where=text("title_translated IS NULL")),
    )

    def __repr__(self):
        return f"<Chapter(id={self.id}, book_id={self.book_id}, sequence={self.sequence_number})>"


# ============================================================================
# User Tables
# ============================================================================

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, unique=True)
    display_name = Column(String(255), nullable=False)
    public_username = Column(String(255), nullable=False, unique=True)
    public_avatar_url = Column(String(255), nullable=True)
    provider = Column(String(50), nullable=False)
    provider_id = Column(String(255), nullable=False)
    last_login_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    ratings = relationship("BookRating", back_populates="user", cascade="all, delete-orphan")
    reviews = relationship("BookReview", back_populates="user", cascade="all, delete-orphan")
    reading_progress = relationship("ReadingProgress", back_populates="user", cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="user", cascade="all, delete-orphan")
    review_likes = relationship("ReviewLike", back_populates="user", cascade="all, delete-orphan")
    book_lists = relationship("BookList", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('provider', 'provider_id', name='uq_user_provider'),
        Index('idx_users_provider_id', 'provider', 'provider_id'),
    )

    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}')>"


# ============================================================================
# Engagement Tables
# ============================================================================

class BookRating(Base):
    __tablename__ = 'book_ratings'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    rating = Column(Integer, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    user = relationship("User", back_populates="ratings")
    book = relationship("Book", back_populates="ratings")

    __table_args__ = (
        UniqueConstraint('user_id', 'book_id', name='uq_user_book_rating'),
        CheckConstraint('rating IN (-1, 0, 1)', name='ck_rating_value'),
        Index('idx_book_ratings_user_id', 'user_id'),
        Index('idx_book_ratings_book_id', 'book_id'),
    )


class BookReview(Base):
    __tablename__ = 'book_reviews'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    review_text = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    user = relationship("User", back_populates="reviews")
    book = relationship("Book", back_populates="reviews")
    likes = relationship("ReviewLike", back_populates="review", cascade="all, delete-orphan")
    replies = relationship("ReviewReply", back_populates="review", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('user_id', 'book_id', name='uq_user_book_review'),
        Index('idx_book_reviews_user_id', 'user_id'),
        Index('idx_book_reviews_book_id', 'book_id'),
        # Book detail page: reviews sorted by created_at
        Index('idx_book_reviews_book_created', 'book_id', created_at.desc()),
    )


class ReviewLike(Base):
    __tablename__ = 'review_likes'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    review_id = Column(Integer, ForeignKey('book_reviews.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    user = relationship("User", back_populates="review_likes")
    review = relationship("BookReview", back_populates="likes")

    __table_args__ = (
        UniqueConstraint('user_id', 'review_id', name='uq_user_review_like'),
        Index('idx_review_likes_user_id', 'user_id'),
        Index('idx_review_likes_review_id', 'review_id'),
    )


class ReviewReply(Base):
    __tablename__ = 'review_replies'

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_id = Column(Integer, ForeignKey('book_reviews.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    reply_text = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    review = relationship("BookReview", back_populates="replies")
    user = relationship("User")

    __table_args__ = (
        Index('idx_review_replies_review_id', 'review_id'),
        Index('idx_review_replies_user_id', 'user_id'),
    )


class ReadingProgress(Base):
    __tablename__ = 'reading_progresses'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    chapter_id = Column(Integer, ForeignKey('chapters.id', ondelete='SET NULL'), nullable=True)
    source_domain = Column(String(255), nullable=True)
    last_read_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    user = relationship("User", back_populates="reading_progress")
    book = relationship("Book", back_populates="reading_progress")
    chapter = relationship("Chapter")

    __table_args__ = (
        UniqueConstraint('user_id', 'book_id', name='uq_user_book_progress'),
        Index('idx_reading_progresses_user_id', 'user_id'),
        Index('idx_reading_progresses_book_id', 'book_id'),
        Index('idx_reading_progresses_chapter_id', 'chapter_id'),
        Index('idx_reading_progresses_user_last_read', 'user_id', 'last_read_at'),
    )


class ReadingProgressHistory(Base):
    __tablename__ = 'reading_progress_histories'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    chapter_id = Column(Integer, ForeignKey('chapters.id', ondelete='SET NULL'), nullable=True)
    recorded_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    user = relationship("User")
    book = relationship("Book")
    chapter = relationship("Chapter")

    __table_args__ = (
        Index('idx_reading_progress_histories_user_id', 'user_id'),
        Index('idx_reading_progress_histories_book_id', 'book_id'),
        Index('idx_reading_progress_histories_recorded_at', 'recorded_at'),
        Index('idx_rph_community_ranking', 'recorded_at', 'book_id', 'user_id'),
    )


class Bookmark(Base):
    __tablename__ = 'bookmarks'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    status = Column(String(20), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    user = relationship("User", back_populates="bookmarks")
    book = relationship("Book", back_populates="bookmarks")

    __table_args__ = (
        UniqueConstraint('user_id', 'book_id', name='uq_user_book_bookmark'),
        Index('idx_bookmarks_user_id', 'user_id'),
        Index('idx_bookmarks_book_id', 'book_id'),
        Index('idx_bookmarks_user_created', 'user_id', 'created_at'),
        Index('idx_bookmarks_user_status', 'user_id', 'status'),
        CheckConstraint(
            "status IS NULL OR status IN ('reading', 'completed', 'dropped', 'plan_to_read')",
            name='ck_bookmark_status',
        ),
    )


class BookList(Base):
    __tablename__ = 'book_lists'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_public = Column(Integer, nullable=False, default=0)
    follower_count = Column(Integer, nullable=False, server_default='0')
    item_count = Column(Integer, nullable=False, server_default='0')
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    user = relationship("User", back_populates="book_lists")
    items = relationship("BookListItem", back_populates="book_list", cascade="all, delete-orphan")
    follows = relationship("BookListFollow", back_populates="book_list", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_book_lists_user_id', 'user_id'),
        Index('idx_book_lists_public', 'is_public'),
    )

    def __repr__(self):
        return f"<BookList(id={self.id}, name='{self.name}')>"


class BookListItem(Base):
    __tablename__ = 'book_list_items'

    id = Column(Integer, primary_key=True, autoincrement=True)
    list_id = Column(Integer, ForeignKey('book_lists.id', ondelete='CASCADE'), nullable=False)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    added_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    book_list = relationship("BookList", back_populates="items")
    book = relationship("Book")
    likes = relationship("BookListItemLike", back_populates="item", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('list_id', 'book_id', name='uq_list_book'),
        Index('idx_book_list_items_list_id', 'list_id'),
        Index('idx_book_list_items_book_id', 'book_id'),
    )

    def __repr__(self):
        return f"<BookListItem(id={self.id}, list_id={self.list_id}, book_id={self.book_id})>"


class BookListFollow(Base):
    __tablename__ = 'book_list_follows'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    list_id = Column(Integer, ForeignKey('book_lists.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    user = relationship("User")
    book_list = relationship("BookList", back_populates="follows")

    __table_args__ = (
        UniqueConstraint('user_id', 'list_id', name='uq_user_list_follow'),
        Index('idx_book_list_follows_user_id', 'user_id'),
        Index('idx_book_list_follows_list_id', 'list_id'),
    )


class BookListItemLike(Base):
    __tablename__ = 'book_list_item_likes'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    item_id = Column(Integer, ForeignKey('book_list_items.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    user = relationship("User")
    item = relationship("BookListItem", back_populates="likes")

    __table_args__ = (
        UniqueConstraint('user_id', 'item_id', name='uq_user_item_like'),
        Index('idx_book_list_item_likes_user_id', 'user_id'),
        Index('idx_book_list_item_likes_item_id', 'item_id'),
    )


# ============================================================================
# Community Tag Tables
# ============================================================================

class Tag(Base):
    __tablename__ = 'tags'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    display_name = Column(String(100), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    def __repr__(self):
        return f"<Tag(id={self.id}, name='{self.name}')>"


class BookTag(Base):
    __tablename__ = 'book_tags'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    tag_id = Column(Integer, ForeignKey('tags.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    __table_args__ = (
        UniqueConstraint('book_id', 'tag_id', 'user_id', name='uq_book_tag_user'),
        Index('idx_book_tags_book_id', 'book_id'),
        Index('idx_book_tags_tag_id', 'tag_id'),
        Index('idx_book_tags_user_id', 'user_id'),
    )

    def __repr__(self):
        return f"<BookTag(id={self.id}, book_id={self.book_id}, tag_id={self.tag_id})>"


class BooklistTag(Base):
    __tablename__ = 'booklist_tags'

    id = Column(Integer, primary_key=True, autoincrement=True)
    list_id = Column(Integer, ForeignKey('book_lists.id', ondelete='CASCADE'), nullable=False)
    tag_id = Column(Integer, ForeignKey('tags.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    __table_args__ = (
        UniqueConstraint('list_id', 'tag_id', 'user_id', name='uq_booklist_tag_user'),
        Index('idx_booklist_tags_list_id', 'list_id'),
        Index('idx_booklist_tags_tag_id', 'tag_id'),
        Index('idx_booklist_tags_user_id', 'user_id'),
    )

    def __repr__(self):
        return f"<BooklistTag(id={self.id}, list_id={self.list_id}, tag_id={self.tag_id})>"


# ============================================================================
# QQ User & Comment Tables
# ============================================================================

class QQUser(Base):
    __tablename__ = 'qq_users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    uid = Column(String(50), nullable=False, unique=True, index=True)
    nickname = Column(String(255), nullable=True)
    nickname_translated = Column(String(255), nullable=True)
    icon_url = Column(String(500), nullable=True)
    is_author = Column(Integer, nullable=True)
    center_author_id = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    comments = relationship("BookComment", back_populates="qq_user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<QQUser(id={self.id}, uid='{self.uid}', nickname='{self.nickname}')>"


class BookComment(Base):
    __tablename__ = 'book_comments'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    qq_user_id = Column(Integer, ForeignKey('qq_users.id', ondelete='CASCADE'), nullable=False)
    title = Column(Text, nullable=True)
    title_translated = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    content_translated = Column(Text, nullable=True)
    images = Column(Text, nullable=True)
    agree_count = Column(Integer, nullable=True, default=0)
    reply_count = Column(Integer, nullable=True, default=0)
    comment_created_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    book = relationship("Book", back_populates="comments")
    qq_user = relationship("QQUser", back_populates="comments")

    __table_args__ = (
        Index('idx_book_comments_book_id', 'book_id'),
        Index('idx_book_comments_qq_user_id', 'qq_user_id'),
        Index('idx_book_comments_created_at', comment_created_at.desc()),
        # Book detail page: comments sorted by agree_count
        Index('idx_book_comments_book_agree', 'book_id', agree_count.desc()),
    )

    def __repr__(self):
        return f"<BookComment(id={self.id}, book_id={self.book_id})>"


# ============================================================================
# QQ Charts & Catalog Tables
# ============================================================================

class QQChartEntry(Base):
    __tablename__ = 'qq_chart_entries'

    id = Column(Integer, primary_key=True, autoincrement=True)
    gender = Column(String(10), nullable=False)
    rank_type = Column(String(20), nullable=False)
    cycle = Column(String(10), nullable=False)
    position = Column(Integer, nullable=False)
    page = Column(Integer, nullable=False, default=1)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    scraped_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    book = relationship("Book")

    __table_args__ = (
        Index('idx_qq_chart_entries_lookup', 'gender', 'rank_type', 'cycle', 'position'),
        Index('idx_qq_chart_entries_book_id', 'book_id'),
    )

    def __repr__(self):
        return f"<QQChartEntry(id={self.id}, gender='{self.gender}', rank_type='{self.rank_type}', position={self.position})>"


# ============================================================================
# Stats Tables
# ============================================================================

class BookStats(Base):
    __tablename__ = 'book_stats'

    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), primary_key=True)
    chapter_count = Column(Integer, nullable=False, server_default='0')
    latest_chapter_number = Column(Integer, nullable=False, server_default='0')

    # Western ratings (-1=negative, 0=neutral, 1=positive)
    rating_count = Column(Integer, nullable=False, server_default='0')
    rating_positive = Column(Integer, nullable=False, server_default='0')
    rating_negative = Column(Integer, nullable=False, server_default='0')
    rating_neutral = Column(Integer, nullable=False, server_default='0')

    comment_count = Column(Integer, nullable=False, server_default='0')

    review_count = Column(Integer, nullable=False, server_default='0')
    reader_count = Column(Integer, nullable=False, server_default='0')
    bookmark_count = Column(Integer, nullable=False, server_default='0')
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    book = relationship("Book")

    __table_args__ = (
        Index('idx_book_stats_chapter_count', 'chapter_count'),
        Index('idx_book_stats_reader_count', 'reader_count'),
        Index('idx_book_stats_rating_count', 'rating_count'),
        Index('idx_book_stats_review_count', 'review_count'),
    )

    def __repr__(self):
        return f"<BookStats(book_id={self.book_id}, chapters={self.chapter_count})>"


# ============================================================================
# Qidian Booklist Tables
# ============================================================================

class QidianBooklist(Base):
    __tablename__ = 'qidian_booklists'

    id = Column(Integer, primary_key=True, autoincrement=True)
    qidiantu_id = Column(Integer, nullable=False, unique=True)
    title = Column(String(500), nullable=True)
    title_translated = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    description_translated = Column(Text, nullable=True)
    tags = Column(ARRAY(String), nullable=True)
    tags_translated = Column(ARRAY(String), nullable=True)
    follower_count = Column(Integer, nullable=True)
    daosearch_follower_count = Column(Integer, nullable=False, server_default='0')
    book_count = Column(Integer, nullable=True)
    last_updated_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    last_scraped_at = Column(TIMESTAMP(timezone=True), nullable=True)

    items = relationship("QidianBooklistItem", back_populates="booklist", cascade="all, delete-orphan")
    follows = relationship("QidianBooklistFollow", back_populates="booklist", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_qidian_booklists_qidiantu_id', 'qidiantu_id'),
    )

    def __repr__(self):
        return f"<QidianBooklist(id={self.id}, qidiantu_id={self.qidiantu_id}, title='{self.title}')>"


class QidianBooklistFollow(Base):
    __tablename__ = 'qidian_booklist_follows'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    booklist_id = Column(Integer, ForeignKey('qidian_booklists.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    user = relationship("User")
    booklist = relationship("QidianBooklist", back_populates="follows")

    __table_args__ = (
        UniqueConstraint('user_id', 'booklist_id', name='uq_user_qidian_booklist_follow'),
        Index('idx_qidian_booklist_follows_user_id', 'user_id'),
        Index('idx_qidian_booklist_follows_booklist_id', 'booklist_id'),
    )


class QidianBooklistItem(Base):
    __tablename__ = 'qidian_booklist_items'

    id = Column(Integer, primary_key=True, autoincrement=True)
    booklist_id = Column(Integer, ForeignKey('qidian_booklists.id', ondelete='CASCADE'), nullable=False)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='SET NULL'), nullable=True)
    qidian_book_id = Column(Integer, nullable=False)
    position = Column(Integer, nullable=True)
    curator_comment = Column(Text, nullable=True)
    curator_comment_translated = Column(Text, nullable=True)
    heart_count = Column(Integer, nullable=True)
    added_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    booklist = relationship("QidianBooklist", back_populates="items")
    book = relationship("Book", back_populates="booklist_items")

    __table_args__ = (
        UniqueConstraint('booklist_id', 'qidian_book_id', name='uq_booklist_qidian_book'),
        Index('idx_qidian_booklist_items_booklist_id', 'booklist_id'),
        Index('idx_qidian_booklist_items_book_id', 'book_id'),
    )

    def __repr__(self):
        return f"<QidianBooklistItem(id={self.id}, booklist_id={self.booklist_id}, qidian_book_id={self.qidian_book_id})>"


# ============================================================================
# Notification Tables
# ============================================================================

class Notification(Base):
    __tablename__ = 'notifications'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    actor_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    type = Column(String(50), nullable=False)
    metadata_ = Column('metadata', Text, nullable=False, server_default='{}')
    read = Column(Boolean, nullable=False, server_default='false')
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text('now()'))

    __table_args__ = (
        Index('idx_notifications_user_read', 'user_id', 'read'),
        Index('idx_notifications_user_created', 'user_id', 'created_at'),
    )

    def __repr__(self):
        return f"<Notification(id={self.id}, user_id={self.user_id}, type='{self.type}')>"


class NotificationPreference(Base):
    __tablename__ = 'notification_preferences'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    type = Column(String(50), nullable=False)
    enabled = Column(Boolean, nullable=False, server_default='true')

    __table_args__ = (
        UniqueConstraint('user_id', 'type', name='uq_notif_pref_user_type'),
        Index('idx_notif_pref_user', 'user_id'),
    )

    def __repr__(self):
        return f"<NotificationPreference(id={self.id}, user_id={self.user_id}, type='{self.type}')>"


# ============================================================================
# Reader Tables
# ============================================================================

class BookSource(Base):
    __tablename__ = 'book_sources'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    domain = Column(String(255), nullable=False)
    novel_url = Column(String(1000), nullable=False)
    last_checked_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    book = relationship("Book")

    __table_args__ = (
        UniqueConstraint('book_id', 'domain', name='uq_book_source_domain'),
        Index('idx_book_sources_book_id', 'book_id'),
    )

    def __repr__(self):
        return f"<BookSource(id={self.id}, book_id={self.book_id}, domain='{self.domain}')>"


class SourceChapter(Base):
    __tablename__ = 'source_chapters'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    domain = Column(String(255), nullable=False)
    sequence = Column(Integer, nullable=False)
    title = Column(String(500), nullable=True)
    url = Column(String(1000), nullable=False)
    last_fetched_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)

    book = relationship("Book")

    __table_args__ = (
        UniqueConstraint('book_id', 'domain', 'sequence', name='uq_source_chapter'),
        Index('idx_source_chapters_book_domain', 'book_id', 'domain'),
    )

    def __repr__(self):
        return f"<SourceChapter(id={self.id}, book_id={self.book_id}, domain='{self.domain}', seq={self.sequence})>"
