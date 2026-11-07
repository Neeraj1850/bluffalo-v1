.PHONY: check lint typecheck test

# The gate: must pass before every commit (enforced by .githooks/pre-commit).
check: lint typecheck test

lint:
	cd frontend && npm run lint

typecheck:
	cd frontend && npm run typecheck

test:
	cd frontend && npm test
