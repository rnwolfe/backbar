# Releasing Backbar

Backbar has one project version source of truth: the root `package.json`.
Workspace manifests under `packages/*` intentionally do not declare their own
versions.

## Commit Convention

Use conventional commits for every change that should be visible to releases:

- `feat:` creates a minor bump.
- `fix:` creates a patch bump.
- `feat!:` or a `BREAKING CHANGE:` footer creates a breaking-change release.
- `chore:`, `docs:`, `refactor:`, `test:`, `build:`, and `ci:` do not bump on
  their own, but they are still grouped into the changelog when a release is cut.

Backbar is pre-1.0, so breaking changes stay on the `0.x.y` line: a breaking
change bumps the minor version instead of jumping to `1.0.0`.

## Local Workflow

Preview the next release:

```bash
bun run release:dry-run
```

Cut the release locally:

```bash
bun test
bun run typecheck
bun run release
```

The release script:

1. Finds the latest `vX.Y.Z` tag.
2. Reads conventional commits since that tag.
3. Chooses the semver bump.
4. Updates the root `package.json`.
5. Inserts a new Keep-a-Changelog section in `CHANGELOG.md`.
6. Creates `chore(release): vX.Y.Z`.
7. Creates an annotated `vX.Y.Z` tag.

It stops before pushing. After reviewing the release commit and tag, push both:

```bash
git push origin HEAD
git push origin vX.Y.Z
```

## Recovery Before Push

If the release is wrong and has not been pushed:

```bash
git tag -d vX.Y.Z
git reset --hard HEAD~1
```

Use that only when the release commit is the current `HEAD`. If you edited files
manually before the release commit was created, inspect `git status` and restore
only the files you intend to discard.
