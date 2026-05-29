<!-- Generated 2026-05-28 from live competitive analysis of axie.top + Axie 2026 meta + own-code audit. Sources cited inline. -->

# Killer Features to Make Players BUY (vs axie.top)
*Product strategy brief — Axie Origins tracker/sniper (`/home/fer/Documents/axie-tracker-render`)*
*Date: 2026-05-28. Competitor claims verified live this date. Sources cited inline.*

---

## 0. Executive bottom line

axie.top is a mature, cheap freemium **meta + marketplace** tool with **zero predictive features** — verified live on 2026-05-28 across its homepage, `/site-info`, `/matchups`, and `/axie-tracker` pages. It refreshes the top-1000 every 10 seconds, gates an "online N min ago" *recency timestamp* behind premium, and charges **1 USDC = 10 days** (~$1.50/2wk) via Ronin sign-in. It does not predict *when a player will play*, does not surface *who you are about to queue into*, and is run by one solo dev ("puzatin").

**We must not sell "another leaderboard," and we must not compete on price (we're already pricier).** We win on the one capability the entire market lacks and our code already has the bones for: **live + predicted per-player activity — a real "sniper."** The honest caveat: that ML prediction layer is **currently dead in production** (the session DB is never written — `sessionTracker.processPlayerActivity()` has zero callers), so the *truthful* launch wedge is the **1-second live ladder radar** we already ship, with predicted-sessions arriving days after we wire one call.

Sources: [axie.top/site-info](https://axie.top/site-info), [axie.top/](https://axie.top/), [axie.top/axie-tracker](https://axie.top/axie-tracker), [axie.top/matchups](https://axie.top/matchups) (all accessed 2026-05-28); code at `/home/fer/Documents/axie-tracker-render`.

---

## 1. Competitive snapshot — axie.top

| Dimension | axie.top reality (verified 2026-05-28) |
|---|---|
| **What it is** | Community leaderboard + team-meta + head-to-head matchup matrix + marketplace suite. Descriptive/historical, not predictive. |
| **Pricing** | "1 USDC = 10days" verbatim on `/axie-tracker`; pay via "Sign-In with Ronin" wallet, USDC on Ronin, no fiat. ~$1.50/2wk, ~$3/mo, ~36.5 USDC/yr. **Cheaper than our planned $2/2wk.** ([axie.top/axie-tracker](https://axie.top/axie-tracker)) |
| **Refresh** | "the Top 1-1000 leaderboard now refreshes every 10 seconds (was 1 minute)"; below rank 1000 every ~30 min. Marketplace tracker updates every 3 sec. ([axie.top/](https://axie.top/), [axie.top/site-info](https://axie.top/site-info)) |
| **Free tier** | "viewing the Top 1-1000 and filtering by team meta no longer require premium." ([axie.top/](https://axie.top/)) |
| **7 premium features** | Axie Delegation (up to 10 of ~700), Auto-blessing (daily prayer after 3:30 UTC reset), Leaderboard Time Data ("last ranked N min ago"), Team Analytics, Axie Tracker (price alerts, 3s), Price Analysis (100 recent comparable sales since 2023), Morph Finder. **All META or MARKETPLACE.** ([axie.top/site-info](https://axie.top/site-info)) |
| **Matchups** | Head-to-head **team-vs-team winrate matrix**, "aggregated across the selected leaderboard range." Filters: Season 17 back to 8, Top 1-2000 / 1-100 / 100-2000, era All/Rare/Epic/Mystic/Final/Off-Season. **Purely historical aggregate — no per-player or ML layer.** ([axie.top/matchups](https://axie.top/matchups)) |

**Concrete gaps (the openings):**
1. **No prediction of any kind.** Verified: no "ML," "prediction," or "when will a player play" anywhere on the site. Their only activity signal is a passive *"last ranked N min ago"* timestamp.
2. **Their "online" intel is premium-gated AND coarse.** The recency filter is a static lookback, not a live feed and not a forecast.
3. **Matchups is team-vs-team theory, not opponent-specific.** It tells you what *compositions* beat what — never *who is online running team X right now*.
4. **Slow velocity (solo dev), crowded free competition** (axiemeta, axie.zone, official Sky Mavis DOJO, Overwolf AxieTracker) — meaning leaderboard-display itself is commoditized at $0, which is *why* even axie.top monetizes convenience, not data.

> **Honesty flag:** Live user sentiment (Reddit/X/Discord love-or-hate) could NOT be verified — X returns HTTP 402, nitter empty, no Reddit hits. Do not write marketing copy that asserts community sentiment until validated via the axie.top Discord and PH Facebook groups.

---

## 2. Who pays & why

The macro is small and shrinking — ~195K MAU / ~52K DAU, -3.6% MoM; AXS ~$1.10, RON ~$0.085 ([activeplayer.io](https://activeplayer.io/axie-infinity/), [coinmarketcap.com](https://coinmarketcap.com/currencies/axie-infinity/), accessed 2026-05-28; activeplayer is a third-party estimate, not official). The play-to-earn salary era is over — rewards are now **bAXS**, a non-transferable, reputation-gated token ([blog.axieinfinity.com/p/origins-s17-is-live](https://blog.axieinfinity.com/p/origins-s17-is-live)). So willingness-to-pay is **not broad grind income** — it's concentrated and event-driven.

| Segment | Size signal | Top unmet need | WTP driver |
|---|---|---|---|
| **Top-2000 prize chasers** (primary) | Low-single-digit-thousands subset of 52K DAU. **Season 17 is LIVE now — 80K bAXS across Top 2,000, Final Era May 26 to Jun 9** ([blog.axieinfinity.com/p/origins-s17-is-live](https://blog.axieinfinity.com/p/origins-s17-is-live), confirmed live via search 2026-05-28). | "Help me climb / hold rank for the bAXS prize *this era*." Time my push when rivals are offline; protect rank when they're grinding. | High during the **final 2 weeks** of a season. A $2 edge tool is a no-brainer impulse buy against a slice of an 80K-bAXS pool. |
| **Meta diehards / counter-pickers** | Long tail. Documented pain: balance patches swing which Axies win; a $500 Axie can go near-worthless post-patch. | Fast, current "what beats what" plus *who in front of me runs it*. | Moderate, recurring. |
| **SEA / PH grinders & scholars** | The entrenched free tool (axieenergycalculator.com) takes **GCash** donations — hard proof this exact audience pays in PH rails. | Mobile-first, Tagalog-aware, low-friction onboarding; reliable uptime (peers axie.zone/axie.tech/pl4y.io were down 2026-05-28). | Low individual ticket but high volume; price-sensitive — they compare against $0 and against 1-USDC axie.top first. |

> **Honesty flag:** We have **no direct WTP data point** for tracker tools in this segment. The size and spend-appetite of the Top-2000 cohort is the single biggest unverified launch risk. De-risk with a small price test before heavy investment.

---

## 3. Killer features (ranked)

Ranked by **willingness-to-pay x differentiation x feasibility**. "Feasibility" weighs what already exists in the codebase. Honest tags: [SHIPS] ships today; [UNWIRED] built-but-unwired; [NEW] new build.

| # | Feature | What it is | Buyer pain it kills | Why it beats axie.top | Builds on our stack | Effort |
|---|---|---|---|---|---|---|
| **1** | **Live "Who's grinding NOW" radar** [SHIPS] | Real-time feed of which top-300 ladder players just finished a ranked game, with **win/loss direction + rank movement**, inferred from VStar deltas, polled **Top 200 every 1s / Top 300 every 8s**. | "I can't see who's actively pushing the ladder right now or whether they're winning." | axie.top refreshes top-1000 every **10s** and gates even its passive "N min ago" timestamp behind premium; we are **~10x fresher and show win/loss direction they don't have**. ([axie.top/site-info](https://axie.top/site-info)) | `core/vstarScheduler.ts` (1s/8s timers), `core/state.ts` (5-min active window), `core/limiter.ts` multi-key pool that makes 1s polling survivable. **Already the production hot path.** | **S** |
| **2** | **Rival watchlist + online-now / predicted-session alerts** [UNWIRED to NEW] | Pin specific rivals; get pinged when a tracked player goes active, plus "likely to play 21:00-23:00 today (~78%)" from their historical session pattern. | "I want to push when my rivals are *offline* and brace when they're online — but I have to babysit the board to know." | **No competitor ships activity prediction (verified zero ML on axie.top).** This is the defensible wedge — turning their static "N min ago" into "here's when they'll play next." | `ml/sessionTracker.ts` + `ml/simple_predictor.py` + `MLPredictionHover.tsx`/`PlayerPredictions.tsx` exist. **CRITICAL: predictor is dead — `processPlayerActivity()` has zero callers, so the session DB is empty.** Online-now alert ships fast; prediction lights up days after we wire one call. | **S** (wire + online alert) / **M** (full predicted-session alerts) |
| **3** | **Opponent scout card** [UNWIRED] | One unified "scout this player" view: live VStar velocity + recent W/L streak + current ranked team comp + their predicted active windows. | "I see a name on the ladder but nothing about how hot they are, what they run, or when they play." | Fuses what axie.top keeps **fragmented** (online filter + team analytics + matchups) into one player-centric view they don't offer. | `core/scheduler.ts` rival/battle-log pipeline is **built but dormant** (not started in `index.ts`); `routes/axies.ts` already pulls team comp. Decide: revive scheduler vs feed `vstarScheduler`. | **M** |
| **4** | **Counter-pick edge (live meta fusion)** [NEW] | "Rivals around your rank are running Team X; current Top-1000 data says Team Y counters it." Ties axie.top's static matchup matrix to *who's actually live near you*. | "Meta shifts every patch and I don't know what to bring against the people I'm actually facing." | axie.top's `/matchups` is **historical team-vs-team theory only** (verified). Fusing it with our live radar = opponent-specific, which they structurally lack. | New layer over live leaderboard team comps + matchup data; heaviest net-new logic. | **L** |
| **5** | **Reliability + freshness as a paid SLA** [SHIPS] | Just be the tracker that's *always up and fastest*. | "Half these tools are down or stale." (axie.zone/axie.tech/pl4y.io were down 2026-05-28.) | Uptime + 1s freshness is demonstrable; their solo-dev velocity can't easily match the multi-key polling pool. | `core/limiter.ts` + `core/multiKeyLimiter.ts` (5 keys, key rotation, 429 retry) already sustain scale. | **S** (positioning, not build) |

**Deliberately OUT of scope** (research-supported): in-match deck/card overlays (owned free by Overwolf AxieTracker), basic leaderboard display (free + official Sky Mavis DOJO), and the full marketplace suite (axie.top's entrenched moat, off our ladder-edge thesis). Do not fight $0 or the game publisher.

> **Compliance guardrail (verified tailwind + risk):** Sky Mavis perma-banned 241 accounts in S16 and runs per-era integrity checks in S17 ([blog.axieinfinity.com/p/origins-s17-is-live](https://blog.axieinfinity.com/p/origins-s17-is-live)). "Sniper" is fine as *marketing for opponent intel*. Keep every feature strictly **read-only observation of public leaderboard data** — nothing resembling queue-dodging automation or multi-account behavior, or we risk lethal association with bannable conduct.

> **Dependency risk to fix:** `routes/axies.ts` scrapes **axie.top itself** (`static.axie.top`) for team images — a fragility and a competitor dependency. Source comps from Sky Mavis battle-logs (`originsBattleLogs.ts`) to cut the cord.

---

## 4. The wedge — lead with this

**Feature #1 + #2's online-now alert: the "Live Rival Radar — know who's grinding right now, and get pinged when your rivals queue up."**

Why this converts the $2/2wk paywall:
- It is **true today** — `vstarScheduler` already polls 1s/8s in production. We sell what ships, not vaporware. (Marketing the *ML* as live right now would be dishonest until #2 is wired.)
- It is **the one thing verified-absent from every competitor**, axie.top included — live + directional + rival-targeted, vs their premium-gated passive timestamp.
- It maps exactly to the **Top-2000 prize chaser in the Final Era happening *right now* (ends Jun 9)** — "time your push, protect your rank" is the literal job-to-be-done during a season-end bAXS sprint ([blog.axieinfinity.com/p/origins-s17-is-live](https://blog.axieinfinity.com/p/origins-s17-is-live)).
- It sets up the durable moat: once `sessionTracker` is wired (one call) and runs a few days, the radar gains **predicted sessions** — the headline becomes "we tell you *when* they'll play before they do," which axie.top cannot answer.

Tagline direction (validate sentiment/Tagalog with PH community before locking): *"Real-time ladder radar — see who's grinding, when your rivals play, and time your climb."*

---

## 5. Positioning & pricing

**One-line positioning:** *"axie.top tells you what the meta did. We tell you what your rivals are doing right now — and when they'll do it next."*

**Is $2/2wk right?** It's defensible **only because it's anchored to a capability gap, not convenience** — but be deliberate:

- axie.top anchors entry at **1 USDC/10 days (~$0.10/day); we'd be $2/14 days (~$0.14/day)** — *more expensive at the exact price a buyer compares first*, on the *same* USDC-on-Ronin rail (so no friction excuse). ([axie.top/axie-tracker](https://axie.top/axie-tracker))
- **Recommendation:** keep $2/2wk as the standard plan but **add a free/cheap trial tier that matches or undercuts 1 USDC** at the door (e.g. free live radar for *your own rank +/- N*, or a 3-day trial), so you win the first comparison. Justify the $2 purely on rival-watchlist + predicted sessions.
- **Align billing to the season/era rhythm.** A "2-week" window neatly covers a Final-Era push (S17 Final Era is May 26 to Jun 9 right now). Consider a "season pass" framing for the spend moment. ([blog.axieinfinity.com/p/origins-s17-is-live](https://blog.axieinfinity.com/p/origins-s17-is-live))
- Stablecoin (USDC) is the right call — it sidesteps AXS/RON volatility entirely.

> **Honesty flag:** This pricing call rests on the *verified* 1-USDC/10-day anchor but on an *unverified* assumption about Top-2000 spend appetite. Price-test before scaling. The full premium *feature value* comparison (their behind-wall premium UX) was not authenticated this pass.

---

## 6. Two-week roadmap (smallest-first, on current codebase)

Sequenced to ship the truthful wedge fast and light the ML moat within the window — timed against the S17 Final Era spend moment (ends Jun 9).

1. **Day 1 — Wire the dead predictor (one line).** Call `sessionTracker.processPlayerActivity(player)` inside `vstarScheduler.processLeaderboardData`'s active-players loop so `data/sessions.db` starts filling. **S.** This is the single highest-leverage change in the repo — it converts a ~90%-built feature from vaporware to live within days of uptime.
2. **Day 1-3 — Cut the competitor dependency.** Replace the `routes/axies.ts` scrape of `static.axie.top` with team comps from Sky Mavis battle-logs (`originsBattleLogs.ts`). Removes fragility and stops leaking usage to axie.top. **S-M.**
3. **Day 3-6 — Ship the wedge UI: Live Rival Radar.** Surface the existing 1s/8s active-player feed with win/loss direction + rank movement as the product's hero view; add a **rival watchlist** (pin players). **S-M.**
4. **Day 6-9 — Online-now alerts.** Push/notification when a watched player goes active (data already in `state.ts` 5-min active window). **S.**
5. **Day 9-12 — Light up predicted sessions.** With ~1 week of session data accumulating, expose `MLPredictionHover`/`PlayerPredictions` ("next likely sessions"). Gate predicted-session alerts behind the $2 paywall; keep basic live radar in a free/trial tier. **M.**
6. **Day 12-14 — Launch + de-risk.** Ship behind the Ronin-USDC paywall with the season-aligned trial; **run a small price test** and validate sentiment/Tagalog copy in the axie.top Discord + PH Facebook groups before scaling spend. **S.**

Defer to post-launch: Opponent Scout Card (#3, revive-or-delete `scheduler.ts`) and the Counter-pick edge (#4) — high value but L-effort; not required to convert the first paywall.

---

### Source ledger (accessed 2026-05-28)
- Competitor (live-fetched this date): [axie.top/site-info](https://axie.top/site-info), [axie.top/](https://axie.top/), [axie.top/axie-tracker](https://axie.top/axie-tracker), [axie.top/matchups](https://axie.top/matchups)
- Season/economy: [blog.axieinfinity.com/p/origins-s17-is-live](https://blog.axieinfinity.com/p/origins-s17-is-live), [egamers.io S17](https://egamers.io/axie-infinity-origins-season-17-rolls-out-enhancements-and-updates/), [activeplayer.io](https://activeplayer.io/axie-infinity/) (third-party estimate), [coinmarketcap.com AXS](https://coinmarketcap.com/currencies/axie-infinity/)
- Our stack: code at `/home/fer/Documents/axie-tracker-render` — `backend/src/core/vstarScheduler.ts`, `backend/src/ml/sessionTracker.ts`, `backend/src/ml/simple_predictor.py`, `backend/src/core/scheduler.ts`, `backend/src/core/limiter.ts`, `backend/src/routes/axies.ts`
- **Unverified (do not assert):** live user sentiment (X HTTP 402 / nitter empty / no Reddit hits); Top-2000 segment size & spend appetite; axie.top's authenticated premium UX value.