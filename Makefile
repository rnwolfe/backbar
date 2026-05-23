# Factory quality interface: make typecheck, make lint, and make test
# run as quality checks after every run (see .factory/quality.yaml).
.PHONY: dev typecheck lint test

dev:
	bun run dev

typecheck:
	bun run typecheck

lint:
	@echo "make lint: no linter configured"

test:
	bun test
