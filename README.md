# Render.com Free Tier Deployment

## Overview

Deploy the Axie tracker + sniper + payment system to Render.com free tier. The container sleeps after 15 min of inactivity — UptimeRobot pings `/api/health` every 5 min to keep it awake.

Important reality check from current Render docs:
- Free web services use an ephemeral filesystem.
- Any local SQLite data is lost whenever the service spins down, restarts, or redeploys.
- Persistent disks are paid-only.

That means this free setup is suitable for hobby or preview use, not reliable production tracking history.

**Cost:** $0/mo (free tier)
**Requirements:** Render.com account (GitHub signup)

---

## ⚠️ Important: UptimeRobot Setup Required

After deploying, you **must** set up UptimeRobot to prevent the container from sleeping:

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add a new HTTP(s) monitor:
   - Friendly name: `Axie Tracker`
   - URL: `https://your-app.onrender.com/api/health`
   - Monitoring interval: **5 minutes**
3. That's it — UptimeRobot free tier allows 50 monitors.

Without this, the container sleeps after 15 min and the tracker restarts fresh each time.

---

## Step 1: Push to GitHub

The app must be on GitHub to deploy to Render.

```bash
cd /path/to/axie-mvp
git init
git add .
git commit -m "Axie tracker + sniper + payments"
git remote add origin https://github.com/YOUR_USERNAME/axie-tracker.git
git push -u origin main
```

---

## Step 2: Deploy to Render

1. Log in to [render.com](https://render.com) with GitHub
2. Click **New +** → **Web Service**
3. Connect your GitHub repo
4. Configure the service:

| Setting | Value |
|---------|-------|
| Name | `axie-tracker` |
| Region | Oregon (closest to Ronin/Sky Mavis) |
| Branch | `main` |
| Runtime | **Docker** |
| Dockerfile Path | `./backend/Dockerfile` |
| Plan | **Free** |
| Health Check | `/api/health` |

5. Click **Create Web Service**

---

## Step 3: Set Environment Variables

In the Render dashboard, go to **Environment** and add:

### Required (you must set these)

| Key | Value |
|-----|-------|
| `ORIGINS_API_KEYS` | Your Sky Mavis API keys (comma-separated) |
| `API_KEY` | A random secret string for API access (generate one) |

### Already Set in render.yaml

These are pre-configured in `render.yaml`:
- `PAYMENT_WALLET_ADDRESS` = `ronin:51a8318FBFf6DDFee50Ee0fb0f33AF02F34fF649`
- `RONIN_RPC_URL` = `https://ronin.drpc.org`
- `USDC_CONTRACT` = `0x9433e1776c043289c0a5aba2eb9ff8dd1e8471c3`
- All plan prices (PLANS_USDC_*, PLANS_RON_*)

---

## Step 4: Wait for Deploy

First deploy takes ~3-5 minutes. Render will build the Docker container.

Check **Logs** in the Render dashboard for progress.

---

## Step 5: Verify

```bash
# Health check
curl https://your-app.onrender.com/api/health

# Rates endpoint
curl https://your-app.onrender.com/api/payments/rates

# Should return plan prices
```

---

## Step 6: Set Up UptimeRobot

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Dashboard → **Add New Monitor**
3. Settings:
   - Type: **HTTP(s)**
   - Friendly Name: `Axie Tracker Health`
   - URL: `https://your-app.onrender.com/api/health`
   - Monitoring Interval: **5 minutes**
   - Alert Contacts: your email

---

## Using the App

1. Open `https://your-app.onrender.com/` in browser with Ronin Wallet extension
2. If you want the most stable free-tier access, use the `API_KEY` env var you set in Render
3. The payment flow can still work during a live instance, but payment sessions and generated keys are stored in local SQLite and will reset whenever the free service sleeps or restarts
4. Use the key:

```bash
# Get leaderboard
curl -H "X-API-Key: YOUR_KEY" https://your-app.onrender.com/api/leaderboard

# Get active players
curl -H "X-API-Key: YOUR_KEY" https://your-app.onrender.com/api/active-players

# Get predictions for a user
curl -H "X-API-Key: YOUR_KEY" https://your-app.onrender.com/api/predictions/USER_ID
```

---

## Upgrade to Paid ($5/mo) — Always-On

When you have payment revenue:

1. Render dashboard → your service → **Plan**
2. Change to **Starter** ($5/mo) or **Standard**
3. Container stays always-on, no more UptimeRobot needed

---

## Recovering from Sleep

If the container ever sleeps and UptimeRobot hasn't been pinging:
- The app wakes on the next health check
- Tracker reconnects and rebuilds leaderboard state (~10 seconds)
- Payment verifier resumes, but any local SQLite state from the previous instance may be gone
- `payments.db` and `sessions.db` should be treated as disposable on Render free

---

## Common Issues

| Problem | Fix |
|---------|-----|
| 401 Unauthorized | Check `API_KEY` env var matches what you used |
| Payment not confirming | Check `RONIN_RPC_URL` is set; check `PAYMENT_WALLET_ADDRESS` |
| Container always sleeping | Add UptimeRobot monitor at 5-min interval |
| First deploy fails | Check `ORIGINS_API_KEYS` is set in Render env vars |
