# --- Builder Stage ---
FROM python:3.12-alpine AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apk add --no-cache \
    build-base \
    g++ \
    libpq \
    libpq-dev \
    gettext \
    git \
    openssl-dev \
    libffi-dev \
    cargo \
    rust \
    cmake

RUN python -m venv /opt/venv

RUN . /opt/venv/bin/activate && \
    pip install --no-cache-dir --upgrade pip setuptools wheel

COPY ./backend/requirements.txt /requirements.txt
COPY ./backend/requirements.dev.txt /requirements.dev.txt
RUN pip install --no-cache-dir -r /requirements.dev.txt

COPY ./backend /app

# --- Runtime Stage ---
FROM python:3.12-alpine

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apk add --no-cache libpq gettext dos2unix

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app /app

COPY ./compose/start.sh /start
RUN dos2unix /start && chmod +x /start

RUN adduser -u 5678 -D appuser
RUN chown -R appuser /app && chown -R appuser /opt/venv
USER appuser
