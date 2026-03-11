from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
from contextlib import contextmanager
import logging
from typing import Generator, Optional
from .config import config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# SQLAlchemy Base
Base = declarative_base()

class DatabaseManager:
    def __init__(self):
        self.engine: Optional[object] = None
        self.SessionLocal: Optional[sessionmaker] = None
        self._initialize_database()

    def _initialize_database(self):
        """Initialize database connection with connection pooling"""
        try:
            db_config = config.database

            # Build connection URL
            if db_config['ssl']:
                connection_url = (
                    f"postgresql://{db_config['user']}:{db_config['password']}"
                    f"@{db_config['host']}:{db_config['port']}/{db_config['database']}"
                    f"?sslmode=require"
                )
            else:
                connection_url = (
                    f"postgresql://{db_config['user']}:{db_config['password']}"
                    f"@{db_config['host']}:{db_config['port']}/{db_config['database']}"
                )

            # QueuePool: reuse DB connections across jobs within each worker process.
            # With SimpleWorker (no fork-per-job), connections persist and pooling works.
            # pool_size=2 per worker process, with overflow for burst queries.
            self.engine = create_engine(
                connection_url,
                poolclass=QueuePool,
                pool_size=2,
                max_overflow=3,
                pool_recycle=300,
                pool_pre_ping=True,
                echo=False,
            )

            # Create session factory
            self.SessionLocal = sessionmaker(
                autocommit=False,
                autoflush=False,
                bind=self.engine
            )

            # Auto-create tables if they don't exist
            self._auto_migrate()

            logger.debug("✅ Database connection pool initialized")

        except Exception as e:
            logger.error(f"❌ Failed to initialize database: {e}")
            raise

    def _auto_migrate(self):
        """Create tables only if they don't exist yet"""
        try:
            from . import models  # noqa: F401

            # Quick check — if the books table exists, skip migration
            with self.engine.connect() as conn:
                result = conn.execute(text(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'books')"
                ))
                if result.scalar():
                    return

                # Tables missing — run full migration
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
                conn.commit()

            Base.metadata.create_all(bind=self.engine)
            logger.info("Database tables created")
        except Exception as e:
            logger.error(f"Auto-migration failed: {e}")
            raise

    def _test_connection(self):
        """Test database connection"""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                result.fetchone()
        except Exception as e:
            logger.error(f"❌ Database connection test failed: {e}")
            raise

    @contextmanager
    def get_session(self) -> Generator[Session, None, None]:
        """Get database session with automatic cleanup"""
        if not self.SessionLocal:
            raise RuntimeError("Database not initialized")

        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"❌ Database session error: {e}")
            raise
        finally:
            session.close()

    def get_session_sync(self) -> Session:
        """Get database session (manual management required)"""
        if not self.SessionLocal:
            raise RuntimeError("Database not initialized")
        return self.SessionLocal()

    def close(self):
        """Close database connections"""
        if self.engine:
            self.engine.dispose()
            logger.info("🔒 Database connections closed")

    def get_connection_info(self) -> dict:
        """Get connection information"""
        if not self.engine:
            return {"status": "not_initialized"}

        return {
            "status": "connected",
            "pool_class": "QueuePool",
        }

# Global database manager instance
db_manager = DatabaseManager()