.PHONY: check lint typecheck test

# The gate: must pass before every commit (enforced by .githooks/pre-commit).
check: lint typecheck test

lint:
	cd frontend && npm run lint
	cd backend && uv run ruff check . && uv run ruff format --check .

typecheck:
	cd frontend && npm run typecheck

test:
	cd frontend && npm test
	cd backend && uv run pytest -q
