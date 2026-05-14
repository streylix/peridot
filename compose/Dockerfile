# --- Builder Stage ---
FROM python:3.12-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    libpq-dev \
    gettext \
    git \
    openssl \
    libffi-dev \
    cargo \
    rustc \
    cmake \
    ffmpeg && \
    rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv

RUN . /opt/venv/bin/activate && \
    pip install --no-cache-dir --upgrade pip setuptools wheel

COPY ./backend/requirements.txt /requirements.txt
COPY ./backend/requirements.dev.txt /requirements.dev.txt
RUN pip install --no-cache-dir -r /requirements.dev.txt

COPY ./backend /app

# --- Runtime Stage ---
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    gettext \
    dos2unix \
    ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app /app

COPY ./compose/start.sh /start
RUN dos2unix /start && chmod +x /start
