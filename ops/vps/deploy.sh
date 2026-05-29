#!/usr/bin/env bash
# Clean-source VPS deploy for the Axie tracker.
#
# ROOT CAUSE this fixes: earlier deploys shipped files additively (tar/copy with
# no delete semantics), so git-DELETED files (the old Discord auth + polling
# payment system) lingered on the box and broke `tsc` against removed types.
# This script makes the checkout an EXACT mirror of the remote branch before it
# builds — git reset --hard + git clean -fdx delete anything not tracked at the
# target commit, so stale files can never survive a redeploy.
#
# Run ON THE VPS, from anywhere. It does NOT touch your local working tree.
#
#   ops/vps/deploy.sh            # deploy the default branch below
#   BRANCH=main ops/vps/deploy.sh
#   DEPLOY_DIR=/opt/axie ops/vps/deploy.sh
#
# It is idempotent and safe to re-run.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/waitdeadai/axie-tracker-render.git}"
BRANCH="${BRANCH:-feat/sota-2026-ronin-payments}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/axie}"
COMPOSE_FILE="ops/vps/docker-compose.vps.yml"

log() { printf '\n\033[1;36m[deploy]\033[0m %s\n' "$*"; }

# 1. Ensure the deploy dir is a clean checkout of the target branch.
if [ ! -d "${DEPLOY_DIR}/.git" ]; then
  log "Fresh clone of ${REPO_URL} (${BRANCH}) into ${DEPLOY_DIR}"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${DEPLOY_DIR}"
fi

cd "${DEPLOY_DIR}"

log "Fetching ${BRANCH} and mirroring the working tree to origin (delete semantics)"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
# reset --hard + clean -fdx is the canonical "no stale files survive" combo:
#   reset --hard  -> tracked files match origin exactly (incl. deletions)
#   clean -fdx    -> untracked + ignored leftovers (old src files, build junk) gone
# -e preserves the operator-created secret file so we don't wipe runtime.cfg.
git reset --hard "origin/${BRANCH}"
git clean -fdx -e ops/vps/runtime.cfg -e 'ops/vps/.env*'

# 2. Secret file sanity check (compose loads env_file: runtime.cfg).
if [ ! -f "ops/vps/runtime.cfg" ]; then
  log "ERROR: ops/vps/runtime.cfg is missing. Create it first:"
  echo "    cp ops/vps/env.vps.example.txt ops/vps/runtime.cfg && nano ops/vps/runtime.cfg"
  exit 1
fi

# 3. Rebuild + restart. --build forces a fresh image; the .dockerignore keeps
#    stale host node_modules/dist out of the build context so the in-image
#    install/build is authoritative.
log "Building and restarting the container"
docker compose -f "${COMPOSE_FILE}" up -d --build

# 4. Drop dangling images from the previous build so the box doesn't fill up.
log "Pruning dangling images"
docker image prune -f >/dev/null || true

log "Done. Tail logs with:"
echo "    docker compose -f ${COMPOSE_FILE} logs -f"
