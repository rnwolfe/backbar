# Backbar in production

Backbar runs in production on **svr01** as a single Bun process under a systemd
**user** service, fronted by the home-lab `expose` Caddy. One process serves
three things on one port, routed by `Host` header:

| URL | Surface | Auth |
|---|---|---|
| `https://backbar.labs.rwolfe.io` | operator console (`operator-ui`) + full API + `/live` WS | **bearer token** (`BACKBAR_TOKEN`) |
| `https://menu.labs.rwolfe.io` | guest menu (`guest-ui`), read-only | none — public, hard-limited to `/api/guest/*` |

The `backbar` CLI (`scripts/backbar`, symlinked to `~/.local/bin/backbar` by
bootstrap) drives everything.

## One-time bootstrap

```bash
git clone https://github.com/rnwolfe/backbar.git ~/prod/backbar
cd ~/prod/backbar
# Create .env.local (see below), then:
./scripts/backbar bootstrap     # install · migrate · seed · build · install+start service
./scripts/backbar expose        # publish both subdomains (first hit ~10s for the LE cert)
sudo loginctl enable-linger $USER   # if bootstrap says linger is off
backbar status
```

### `.env.local` (prod, gitignored)

```ini
PORT=8788
# bun:sqlite reads BACKBAR_DB (NOT DATABASE_URL). Keep data outside the repo.
BACKBAR_DB=/home/rnwolfe/prod/backbar/data/backbar.db
# Operator gate — any sufficiently long random string. Rotate with `backbar token --rotate`.
BACKBAR_TOKEN=<openssl rand -hex 24>
# HMAC for signed firmware/manual ingest (optional in P0/P1).
HMAC_SECRET=<openssl rand -hex 32>
NODE_ENV=production
```

The AI key auto-bootstraps from `~/.ai_gateway_api_key` at startup
(`packages/server/src/main.ts` → `bootstrapGatewayKey()`), so it does not need
to live in `.env.local`. The systemd unit supplies `BACKBAR_OPERATOR_DIST` /
`BACKBAR_GUEST_DIST` (the two `dist` paths) itself.

## Everyday deploy

```bash
backbar deploy        # fetch origin/main · install · migrate · rebuild · restart · smoke
```

Refuses on a dirty tree. It is idempotent — safe to re-run. Tracks
`origin/main`, so land changes there first.

## Releases & "What's New"

The operator console shows a **What's New** modal once per version, built from
the latest `CHANGELOG.md` entry baked into the bundle at build time (see
`operator-ui/vite.config.ts` → `__BACKBAR_VERSION__` / `__BACKBAR_CHANGELOG__`).
So an announcement is just a release that gets built and deployed.

```bash
backbar release --dry-run   # preview the next version + changelog
backbar release             # bump package.json, write CHANGELOG.md, tag vX.Y.Z (local)
backbar announce            # release → push commit+tag → deploy (ships the modal)
```

Use conventional commits (`feat:`, `fix:`, `feat!:`) so `release` can compute
the bump — see `RELEASING.md`.

## Operations

```bash
backbar status              # version · service state · health · exposed URLs
backbar logs -f             # journalctl --user -u backbar-api -f
backbar restart             # also: start | stop
backbar token --show        # current operator token (paste into the console)
backbar token --rotate      # new token + restart (operators must re-paste)
backbar expose              # (re)publish both subdomains, idempotent
```

## Smoke tests

```bash
# Operator API requires the token:
curl -fsS https://backbar.labs.rwolfe.io/api/bottles                 # → 401
curl -fsS -H "Authorization: Bearer $(backbar token --show)" \
     https://backbar.labs.rwolfe.io/api/bottles                       # → 200

# Guest menu is public; operator API is blocked on the menu host:
curl -fsS https://menu.labs.rwolfe.io/api/guest/menu                  # → 200
curl -s   https://menu.labs.rwolfe.io/api/bottles                     # → 403
```
