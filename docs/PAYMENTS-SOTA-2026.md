# Axie tracker — SOTA-2026 Ronin payments & on-chain access

Status: design + ops doc for branch `feat/sota-2026-ronin-payments`.
Last verified against chain reality: **2026-05-28**.

This replaces the old Discord-OAuth access model and the old Render-era payment
code (`paymentVerifier.ts` / `paymentDb.ts` / `routes/payments.ts` — "eso es
viejo"). Access is now driven by on-chain USDC payments on Ronin, with an owner
whitelist for already-paid wallets.

---

## 1. Access model

Authorization is computed live on every gated request — it is NOT baked into the
JWT — so an expiry or a revocation takes effect immediately:

```
isAuthorized := hasActiveAccess(wallet) || isWhitelisted(wallet)
```

- **Authentication** = "this request proves control of wallet X" via SIWE
  (Sign-In With Ethereum, EIP-4361) over a server-issued single-use nonce.
- **Authorization** = "wallet X currently has access" = an unexpired paid
  subscription OR an unexpired whitelist entry.

The `isAuthenticated` / `isAuthorized` middleware and the set of gated routes are
unchanged from the Discord era — only the *source* of authorization flipped from
the Discord allowlist to on-chain state.

### Chain facts (verified live 2026-05-28 — primary sources)

| Thing | Value |
|---|---|
| Chain | Ronin mainnet, chainId **2020** (`0x7e4`), native gas **RON** |
| Block time | ~2s, ~6s fast finality |
| RPC (default, zero-dep) | `https://api.roninchain.com/rpc` (rate-limited) |
| RPC (alt public) | `https://ronin.drpc.org` |
| RPC (keyed) | `https://api-gateway.skymavis.com/rpc` + header `X-API-KEY` |
| USDC (bridged, **CCIP**, not native Circle) | `0x0b7007c13325c48911f73a2dad5fa5dcbf808adc`, **6 decimals** |
| Receiver (owner) wallet — RECEIVE ONLY | `0x51a8318FBFf6DDFee50Ee0fb0f33AF02F34fF649` |
| ERC-20 Transfer topic0 | `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` |

`US$2 = 2_000_000` USDC base units (6 decimals). The poller reads the **finalized**
head (`provider.getBlock("finalized")`) and only counts transfers at/below it, so
a reorg can't grant access on a tx that later disappears.

> **The app NEVER holds or requires the owner's private key.** It only ever reads
> the chain and detects incoming transfers to the receiver. The old
> `PAYMENT_WALLET_PRIVATE_KEY` is removed and must not come back.

> **Wrong-contract guard:** the pre-2026 `USDC_CONTRACT` default
> `0x9433e1776c043289c0a5aba2eb9ff8dd1e8471c3` was verified to be a non-contract
> (`eth_getCode` → `0x`). Do not use it.

> **AXS is out of scope for v1.** AXS (`0x97a9107c1793bc407d6f527b77e7fff4d812bece`,
> 18 decimals) pricing needs a live price oracle and is a documented,
> behind-a-flag future extension — not implemented now.

---

## 2. Architecture

### Sign-in (frontend, SOTA 2026)

1. Frontend connects the Ronin Wallet with **`@sky-mavis/tanto-connect`** (latest
   0.0.22). Optionally **`@sky-mavis/tanto-widget`** (0.0.5) for a prebuilt connect
   modal. **`@sky-mavis/tanto-wagmi` is DEPRECATED — do not use it.**
2. `GET /api/auth/nonce` → server issues a single-use nonce, pins it on the
   session (10-min TTL).
3. Wallet signs a SIWE message (npm `siwe` 3.0.0) carrying that nonce + chainId 2020.
4. `POST /api/auth/verify { message, signature }` → server verifies the signature
   **server-side** (`SiweMessage.verify`) against the session nonce, burns the
   nonce (single-use), pins the wallet on the session, and returns a JWT plus the
   wallet's current access status.

This mirrors the official Sky Mavis sign-in guide
(`docs.skymavis.com/ronin/wallet/guides/sign-in`).

### Pay → grant

1. `GET /api/payment/intent?plan=2weeks` → `{ to, tokenContract, chainId,
   decimals, amount, humanAmount, plan }`. The wallet sends exactly `amount` USDC
   to `to` (the receiver).
2. Two detection paths (both implemented):
   - **Poller (PRIMARY, zero third-party deps, default).** `eth_getLogs` over USDC
     `Transfer` events to the receiver, up to the finalized head, every
     `PAYMENT_POLL_INTERVAL_MS`. Maps the amount to the largest plan it covers,
     records the tx as consumed (replay-proof via the tx-hash PK), and grants.
   - **Moralis Streams webhook (OPTIONAL, instant).**
     `POST /api/payment/webhook/moralis`, guarded by the Moralis signature header
     (verified with `MORALIS_STREAM_SECRET`). Needs a Moralis account + this
     backend reachable at a public URL. Leave the secret empty to run poller-only.
   - The user can also self-claim a known tx: `POST /api/payment/claim { txHash }`.
   All three converge on the same `grantAccess()` which **de-dupes by tx hash**, so
   the poller and the webhook seeing the same transfer grant access exactly once.
3. `grantAccess()` extends from `max(now, existing.expires_at)`, so stacking plans
   adds time instead of overwriting.

### Storage

`access.db` (better-sqlite3, WAL) in `DATA_DIR` (`/data` on the VPS, persistent
volume). Tables: `subscriptions(wallet PK, plan, started_at, expires_at)`,
`consumed_tx(tx_hash PK, …)`, `whitelist(wallet PK, reason, until)`. Wallets are
stored EIP-55 checksummed so equality is stable.

### API surface (new)

| Method + path | Auth | Purpose |
|---|---|---|
| `GET /api/auth/nonce` | none | issue SIWE nonce |
| `POST /api/auth/verify` | none | verify SIWE → session + JWT |
| `POST /api/auth/logout` | session | drop wallet session |
| `GET /api/access/status` | session | access status for signed-in wallet |
| `GET /api/payment/intent?plan=` | none | payment instructions |
| `POST /api/payment/claim` | session | verify a tx hash and grant |
| `POST /api/payment/webhook/moralis` | Moralis sig | stream webhook |
| `POST /api/admin/whitelist` | `X-Admin-Token` | season whitelist seeding |

---

## 3. Season WHITELIST seeding (owner procedure)

The whitelist lets the owner grant access to wallets that already paid (last
season, off-chain, or via the old Discord cohort) without forcing a re-payment.
Entries are time-boxed by an `until` epoch-ms timestamp — set it to season end so
the grant auto-expires.

The route is guarded by the `X-Admin-Token` header matching `ADMIN_TOKEN`. If
`ADMIN_TOKEN` is unset, the route returns 401 for everyone (fail-closed).

```bash
# Compute a season-end epoch-ms (example: 2026-08-31T23:59:59Z)
UNTIL=$(date -u -d '2026-08-31T23:59:59Z' +%s%3N)   # GNU date; epoch MILLIseconds

# Whitelist one already-paid wallet until season end
curl -fsS -X POST https://axie.waitdead.com/api/admin/whitelist \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d "{\"address\":\"0xWALLET...\",\"until\":$UNTIL,\"reason\":\"S-prev paid, migrated\"}"
# -> { "ok": true, "wallet": "0x...", "until": <ms>, "reason": "..." }
```

Seed a whole cohort from a file of wallet addresses (one per line):

```bash
UNTIL=$(date -u -d '2026-08-31T23:59:59Z' +%s%3N)
while read -r w; do
  [ -z "$w" ] && continue
  curl -fsS -X POST https://axie.waitdead.com/api/admin/whitelist \
    -H "Content-Type: application/json" \
    -H "X-Admin-Token: $ADMIN_TOKEN" \
    -d "{\"address\":\"$w\",\"until\":$UNTIL,\"reason\":\"season seed\"}" \
    && echo "  + $w"
done < wallets.txt
```

Validation enforced by the route: `address` required and a valid EVM address;
`until` must be a **future** epoch-ms timestamp (a past/zero value is rejected
400). Re-POSTing the same wallet upserts (extends/changes `until` + `reason`).

To "remove" a wallet before season end, re-seed it with an `until` ~1 minute in
the future and let it lapse, or delete the row directly from `access.db`
(`DELETE FROM whitelist WHERE wallet = '0x...';`) — there is no DELETE route by
design (the admin surface stays minimal).

> **macOS `date`:** the `-d` form above is GNU date. On BSD/macOS use
> `date -u -j -f '%Y-%m-%dT%H:%M:%SZ' '2026-08-31T23:59:59Z' +%s` then append
> `000` for milliseconds.

---

## 4. Geo-block is a STOPGAP, not the fix

`ops/vps/Caddyfile.snippet` carries an optional Philippines `@ph` matcher +
`respond 403`. It is **deterrence only**:

- A VPN/proxy/Tor or a relocated device bypasses any country block instantly.
- MaxMind GeoLite2 mislabels some IPs → occasional false 403s.
- It blocks the WHOLE site including `/api/payment/*`, so a legit PH user could
  never pay through it.

Stock Caddy has no GeoIP. Two ways to get the `@ph` matcher working (full snippets
in `ops/vps/Caddyfile.snippet`):

- **MaxMind GeoIP2 module** — needs a custom Caddy build
  (`xcaddy build --with github.com/zhangjiayin/caddy-geoip2`) + a
  GeoLite2-Country.mmdb + a global `geoip2_api` block; matcher tests
  `{geoip2.country_code} == "PH"`. This is the right path for our direct-edge
  Contabo Caddy.
- **Cloudflare `CF-IPCountry` header** — zero custom build, but ONLY valid if the
  site is proxied through Cloudflare, and you must restrict trust to Cloudflare
  source IPs or the header is forgeable.

**The real fix is the wallet-payment gate** in this doc: a wallet sees the tracker
only after an on-chain USDC payment (or an owner whitelist entry), which no VPN
can fake. Treat the geo-block as a temporary lid while the payment cutover lands,
then consider removing it.

---

## 5. Contabo deploy / cutover runbook

Single Docker container behind the shared Caddy on the Contabo VPS
(`217.216.94.237`), serving both API (`/api/*`) and the static SPA on port 4000,
proxied as `https://axie.waitdead.com`. `access.db` lives in the persistent
`axie_data` volume so subscriptions + whitelist survive restarts/redeploys (the
root-cause fix vs Render's ephemeral FS).

### 5.0 Prereqs on the box
Docker + Compose plugin, Caddy, and a DNS A record `axie.waitdead.com` → VPS IP.
The compose network `axie_net` is `external: true` — create it once if absent:
`docker network create axie_net`.

### 5.1 Pull the branch
```bash
git clone https://github.com/waitdeadai/axie-tracker-render.git /opt/axie
cd /opt/axie
git checkout feat/sota-2026-ronin-payments
# (or: git pull && git checkout feat/sota-2026-ronin-payments)
```

### 5.2 Env
`docker-compose.vps.yml` loads `env_file: runtime.cfg`. Copy the template and fill
the REPLACE_ME secrets:
```bash
cp ops/vps/env.vps.example.txt ops/vps/runtime.cfg
nano ops/vps/runtime.cfg
# MUST fill: JWT_SECRET, SESSION_SECRET (openssl rand -hex 32 each),
#            ADMIN_TOKEN (openssl rand -hex 32),
#            ORIGINS_API_KEYS / ORIGINS_BLOG_KEYS, API_KEY, AXIE_TOP_SECRET_KEY.
# LEAVE as-is (verified): PAYMENT_WALLET_ADDRESS, USDC_CONTRACT, USDC_DECIMALS,
#            RONIN_RPC_URL, RONIN_CHAIN_ID, plan prices.
# OPTIONAL:  RONIN_RPC_API_KEY, MORALIS_API_KEY, MORALIS_STREAM_SECRET.
```
Generate secrets quickly:
```bash
for k in JWT_SECRET SESSION_SECRET ADMIN_TOKEN; do echo "$k=$(openssl rand -hex 32)"; done
```

### 5.3 Build + start (poller starts with the app)
```bash
docker network create axie_net 2>/dev/null || true
docker compose -f ops/vps/docker-compose.vps.yml up -d --build
docker compose -f ops/vps/docker-compose.vps.yml logs -f
# Expect: "Access database initialized at: /data/access.db",
#         the payment poller starting (PAYMENT_POLL_ENABLED=true),
#         "Server running on port 4000".  NO "Discord" lines.
```
The poller runs in-process; it is enabled by `PAYMENT_POLL_ENABLED=true` and needs
no separate service. On (re)start it rescans the last `PAYMENT_POLL_LOOKBACK_BLOCKS`
(~1h) so a payment made during a brief downtime is still caught.

### 5.4 Wire Caddy
```bash
# Append the site block (and optionally the @ph geo-block) from the snippet:
cat ops/vps/Caddyfile.snippet >> /etc/caddy/Caddyfile   # or paste the site block
caddy validate --config /etc/caddy/Caddyfile            # sanity check first
systemctl reload caddy
```
If you enable the MaxMind geo-block, the Caddy binary must be built with the
geoip2 module first (see the snippet); a stock Caddy will fail to parse the
`geoip2_api` / `{geoip2.country_code}` directives.

### 5.5 Smoke test
```bash
curl -fsS https://axie.waitdead.com/api/health                       # {"status":"ok",...}
curl -fsS "https://axie.waitdead.com/api/payment/intent?plan=2weeks"  # to == receiver, amount == 2000000
curl -fsS https://axie.waitdead.com/api/auth/nonce                    # { "nonce": "..." }
# gated route without a token -> 401:
curl -fsS -o /dev/null -w "%{http_code}\n" https://axie.waitdead.com/api/<gated>
```
Verify `payment/intent` returns `tokenContract == 0x0b70...08adc`,
`decimals == 6`, `amount == "2000000"` for the 2weeks plan, and
`to == 0x51a8...F649`.

### 5.6 Cutover (Discord → on-chain)
1. Deploy the branch as above (Discord env left unset — the app no longer reads
   it; the old Discord routes are removed).
2. Seed the existing 8–10 paid clients into the whitelist (§3) with `until` =
   season end, so nobody is locked out at cutover.
3. Announce the SIWE wallet sign-in + the pay-with-USDC flow to new users.
4. (Optional) enable the PH geo-block in Caddy as a temporary lid.
5. Retire the old DNS / Render service once `axie.waitdead.com` is verified green.

### 5.7 Backups (from day 1)
```bash
# access.db lives in the named volume; snapshot weekly
docker run --rm -v axie_data:/data -v /opt/backups:/bk alpine \
  sh -c 'cp /data/access.db /bk/access-$(date -u +%Y%m%dT%H%M%SZ).db'
```

### Rollback
`docker compose -f ops/vps/docker-compose.vps.yml down` and redeploy the prior
image/tag. The `axie_data` volume (and `access.db`) is untouched by `down`, so
subscriptions + whitelist survive a rollback.
