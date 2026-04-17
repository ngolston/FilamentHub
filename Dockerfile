FROM python:3.12-slim

WORKDIR /app

# System deps for Pillow only (no postgres client needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
COPY app/ ./app/
RUN pip install --no-cache-dir -e .

COPY . .

# Run migrations then start the server
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4"]
