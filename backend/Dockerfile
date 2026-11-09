FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.0 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv PATH="/opt/venv/bin:$PATH"

WORKDIR /app
# Dependencies first so code changes don't reinstall them.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

RUN useradd --system --uid 1001 app
USER app
EXPOSE 8000
# Migrate, then serve. DATABASE_URL and BACKEND_TOKEN come from the environment.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
