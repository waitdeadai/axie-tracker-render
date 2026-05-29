# Axie tracker — Contabo VPS deploy runbook

Replaces the Render free-tier deploy. Runs as one Docker container behind the
shared Caddy (same box as waitdead-crm + waitdead-v2).

**Verified locally 2026-05-26:** `docker build -f backend/Dockerfile .` → success
(image 1.14GB). Booted the image with Discord disabled → `/api/health` returned
`{"status":"ok",...}`, `/` returned 200 (SPA), logs showed `Discord auth disabled`,
`Using payment database at: /data/payments.db`, payment verifier + scheduler up.

**Boot-required env (app crashes at start if missing):** `API_KEY`,
`ORIGINS_API_KEYS`, `LEADERBOARD_URL`, `BATTLE_LOG_URL`, `AXIE_TOP_URL`. All are in
the env template with values; just fill the secret REPLACE_ME ones.

## Why we moved off Render
Render free tier uses an **ephemeral filesystem** + `DATA_DIR=/tmp/axie-data`
(`render.yaml:20`). `payments.db` (client API keys + subscription expiries) was
wiped on every spin-down/redeploy → clients lost access. The VPS gives a
**persistent volume** (`axie_data:/data`), so that data survives. The Dockerfile
already declares `VOLUME /data`; the app was built for this.

## Access model decision (2026-05-26)
**Discord login disabled.** `hasDiscordAuthEnabled()` (`backend/src/auth/config.ts`)
returns false when `DISCORD_*` env are unset, so the app boots with Discord auth
off and clients reach the tracker without a Discord ID. The backend data routes
(`/api/*`) are not auth-gated, so this needs no code change. If a frontend
component hard-gates the view on `authStatus.authenticated`, flip it during the
build step below (grep the frontend for `authStatus.authenticated` / `useAuth`).

## Audit fixes folded into this deploy
- 🔴 Persistence → named volume `axie_data:/data` (root-cause fix).
- 🟡 CORS → `CORS_ORIGIN` set to the real domain, never `*` (render.yaml used `*`).
- 🟡 Removed the junk comment URL from render.yaml's path (not carried here).

## Prereqs on the box
Docker + Docker Compose plugin, Caddy, DNS A record for `axie.waitdead.com` → VPS IP.

## Steps
```bash
# 1. clone (or pull) the repo on the VPS
git clone https://github.com/waitdeadai/axie-tracker-render.git /opt/axie
cd /opt/axie

# 2. env: copy the template to the filename compose loads (env_file: runtime.cfg)
#    and fill the REPLACE_ME values (Sky Mavis keys, API_KEY, AXIE_TOP_SECRET_KEY,
#    the real CORS_ORIGIN/FRONTEND_URL). Leave DISCORD_* unset.
cp ops/vps/env.vps.example.txt ops/vps/runtime.cfg
nano ops/vps/runtime.cfg

# 3. build + run (single container, persistent /data volume)
#    Prefer the clean-source deploy script — it mirrors the tree to origin with
#    delete semantics first, so git-deleted files can never linger and break tsc:
ops/vps/deploy.sh
#    (or, equivalently, by hand:)
docker compose -f ops/vps/docker-compose.vps.yml up -d --build
docker compose -f ops/vps/docker-compose.vps.yml logs -f   # expect "Server running on port 4000"

# 4. wire Caddy (TLS auto)
cat ops/vps/Caddyfile.snippet >> /etc/caddy/Caddyfile   # or paste into your Caddyfile
systemctl reload caddy

# 5. smoke test
curl -fsS https://axie.waitdead.com/api/health        # expect {"status":"ok",...}
curl -fsS -o /dev/null -w "%{http_code}\n" https://axie.waitdead.com/   # expect 200 (SPA)
```

## Client re-onboarding (8–10 clients)
With Discord disabled, clients hit `https://axie.waitdead.com` directly — no
login. The paid programmatic API layer (the `axs_` keys in `payments.db`) starts
empty on a fresh volume; if a client needs a programmatic key, they re-purchase
via the payment flow, or restore a prior `payments.db` into the `axie_data`
volume if a backup exists.

## Backups (do from day 1)
```bash
# payments.db lives in the named volume; snapshot it weekly
docker run --rm -v axie_data:/data -v /opt/backups:/bk alpine \
  sh -c 'cp /data/payments.db /bk/payments-$(date -u +%Y%m%dT%H%M%SZ).db'
```
