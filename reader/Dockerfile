FROM python:3.13-slim

# Install system dependencies (needed for lxml, pyahocorasick compilation)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv
RUN pip install uv

# Copy dependency files first for better caching
COPY pyproject.toml uv.lock* ./

# Install dependencies
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
RUN uv sync --frozen || uv sync

# Copy source code
COPY . .
RUN rm -rf .venv

# Environment
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
