.PHONY: check lint typecheck test

# The gate: must pass before every commit (enforced by .githooks/pre-commit).
check: lint typecheck test

# rustup installs cargo here; the git hook may not have it on PATH.
export PATH := $(HOME)/.cargo/bin:$(PATH)
CONTRACT := contracts/poker

lint:
	cd frontend && npm run lint
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd $(CONTRACT) && cargo fmt --check && cargo clippy -q --all-targets -- -D warnings

typecheck:
	cd frontend && npm run typecheck

test:
	cd frontend && npm test
	cd backend && uv run pytest -q
	cd $(CONTRACT) && cargo test -q
