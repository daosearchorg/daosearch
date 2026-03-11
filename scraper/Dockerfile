FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install uv
RUN pip install uv

# Copy pyproject.toml and uv.lock first for better caching
COPY pyproject.toml uv.lock ./

# Install dependencies in a specific location to avoid conflicts
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
RUN uv sync --frozen

# Copy source code (excluding .venv to avoid conflicts)
COPY . .
# Remove any local .venv that might have been copied
RUN rm -rf .venv
RUN chmod +x /app/entrypoint.sh

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

ENTRYPOINT ["/app/entrypoint.sh"]

# Default command (can be overridden)
CMD ["python", "main.py", "scheduler", "start"]
