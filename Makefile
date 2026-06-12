# Factory quality interface: make typecheck, make lint, and make test
# run as quality checks after every run (see .factory/quality.yaml).
.PHONY: dev typecheck lint test release release-dry-run

dev:
	bun run dev

typecheck:
	bun run typecheck

lint:
	@echo "make lint: no linter configured"

test:
	bun test

release:
	bun run release

release-dry-run:
	bun run release:dry-run
