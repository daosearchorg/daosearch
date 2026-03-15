from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    searxng_url: str = "http://localhost:8888"
    redis_url: str = "redis://localhost:6379"
    cors_origins: list[str] = ["http://localhost:8080", "http://localhost:3000"]

    model_config = {"env_prefix": "READER_", "env_file": ".env"}


settings = Settings()
