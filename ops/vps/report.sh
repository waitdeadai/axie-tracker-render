#!/usr/bin/env bash
# Read-only REVENUE + CLIENTS report for the Axie tracker.
#
# Runs the report inside the axie_backend container, which has better-sqlite3
# and the /data volume (where access.db lives). It opens the DB read-only and
# prints revenue + a client roster.
#
# SECURITY: no network surface. This is reachable only via your SSH access to
# the box + docker. It never opens a port, never serves over HTTP, and the
# client/revenue data never touches the frontend.
#
# Usage (on the VPS):
#   bash /opt/axie/ops/vps/report.sh
#
# Manual/off-platform revenue is parsed from each whitelist row's `reason`
# using the convention documented in revenue-report.mjs:
#   paid:<amount><CUR> <YYYY-MM-DD> via:<method> contact:<handle> [note:...]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="${AXIE_CONTAINER:-axie_backend}"
docker exec -w /app/backend -i "$CONTAINER" node < "$DIR/revenue-report.mjs"
