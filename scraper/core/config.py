import os
from typing import Dict, Any
from dotenv import load_dotenv
from pathlib import Path

class Config:
    def __init__(self):
        self._load_environment()
        self._validate_config()

    def _load_environment(self):
        """Load environment files from root directory"""
        env = os.getenv('ENV', 'local')
        root_dir = Path.cwd().parent
        env_file = root_dir / f'.env.{env}'

        # Try to load specific environment file
        if env_file.exists():
            load_dotenv(env_file)

        # Also load default .env file
        default_env = root_dir / '.env'
        if default_env.exists():
            load_dotenv(default_env)

    def _validate_config(self):
        """Validate required environment variables"""
        required = [
            'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
            'REDIS_URL',
        ]

        missing = [key for key in required if not os.getenv(key)]

        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")

    @property
    def database(self) -> Dict[str, Any]:
        return {
            'host': os.getenv('DB_HOST'),
            'port': int(os.getenv('DB_PORT', 5432)),
            'user': os.getenv('DB_USER'),
            'password': os.getenv('DB_PASSWORD'),
            'database': os.getenv('DB_NAME'),
            'ssl': os.getenv('DB_SSLMODE') == 'require'
        }

    @property
    def redis(self) -> Dict[str, str]:
        redis_url = os.getenv('REDIS_URL')
        # For rediss:// URLs, add SSL cert requirements to the URL
        if redis_url and redis_url.startswith('rediss://'):
            redis_url += '?ssl_cert_reqs=none'

        return {
            'url': redis_url
        }

    @property
    def openai(self) -> Dict[str, str]:
        return {
            'api_key': os.getenv('OPENAI_API_KEY'),
            'base_url': os.getenv('OPENAI_BASE_URL'),
            'model': os.getenv('OPENAI_MODEL'),
            'fallback_model': os.getenv('OPENAI_FALLBACK_MODEL')
        }

    @property
    def google_translate(self) -> Dict[str, Any]:
        return {
            'concurrency': int(os.getenv('GOOGLE_TRANSLATE_CONCURRENCY', 20)),
            'timeout': int(os.getenv('GOOGLE_TRANSLATE_TIMEOUT', 15)),
        }

    @property
    def crawler(self) -> Dict[str, int]:
        return {
            'request_timeout': int(os.getenv('CRAWLER_REQUEST_TIMEOUT', 60))
        }

    @property
    def discovery(self) -> Dict[str, Any]:
        return {
            'max_pages': int(os.getenv('DISCOVERY_MAX_PAGES', 100000)),
            'delay': float(os.getenv('DISCOVERY_DELAY', 0.5)),
            'concurrent_requests': int(os.getenv('DISCOVERY_CONCURRENT_REQUESTS', 50)),
        }

    @property
    def r2(self) -> Dict[str, str]:
        return {
            'access_key_id': os.getenv('R2_ACCESS_KEY_ID'),
            'secret_access_key': os.getenv('R2_SECRET_ACCESS_KEY'),
            'endpoint_url': os.getenv('R2_ENDPOINT_URL'),
            'bucket_name': os.getenv('R2_BUCKET_NAME'),
            'public_url': os.getenv('R2_PUBLIC_URL'),
        }

    @property
    def translation_batch_size(self) -> int:
        return int(os.getenv('TRANSLATION_BATCH_SIZE', 100))



# Global config instance
config = Config()