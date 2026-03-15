from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    searxng_url: str
    redis_url: str
    db_host: str
    db_port: int
    db_user: str
    db_password: str
    db_name: str
    cors_origins: list[str]
    gemini_api_key: str = ""
    translation_model: str = "gemini-2.5-flash-lite"
    entity_model: str = "gemini-2.5-flash-lite"
    translation_chunk_size: int = 20
    byok_encryption_key: str = ""

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    model_config = {"env_prefix": "READER_", "env_file": ".env"}


settings = Settings()
