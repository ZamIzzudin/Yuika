#!/usr/bin/env bash
# Yuika Studio self-host updater (D51). Full guide: docs/DEPLOY.md "Updates".
#
#   ./scripts/update.sh            # follow the newest release tag (stable)
#   ./scripts/update.sh --main     # track the main branch (bleeding edge)
#
# What it does: fetch tags, checkout the target, rebuild containers, wait for
# the API healthcheck. User data (the yui-data volume) is never touched.
# Local changes in the checkout are DISCARDED (self-host rule: configure via
# .env only). Rollback: run again after `git checkout vPREVIOUS`.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE=${YUI_COMPOSE_FILE:-docker-compose.prod.yml}
MODE=release
if [ "${1:-}" = "--main" ]; then MODE=main; fi

CURRENT=$(git describe --tags --abbrev=0 2>/dev/null || echo "(none)")

echo "==> Current release: $CURRENT"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "!! Local modifications detected - they will be discarded."
fi

echo "==> Fetching updates"
git fetch --tags --prune origin

if [ "$MODE" = "release" ]; then
  LATEST=$(git tag -l 'v*' | sort -V | tail -1)
  if [ -z "$LATEST" ]; then
    echo "No release tags found yet. Use --main to track development."
    exit 1
  fi
  echo "==> Switching to release $LATEST"
  git checkout --force "$LATEST"
else
  echo "==> Switching to main"
  git checkout --force main
  git pull --ff-only origin main
fi

# --- One-click update runner bootstrap (D71) -----------------------------
# Setup kunci SSH untuk tombol "Update now" di studio. Berjalan otomatis
# saat update pertama; idempoten (aman diulang). Env di .env dan kunci di
# host: keduanya TIDAK bisa diset dari dalam container, hanya dari sini.
# Revoke kapan saja: hapus barisnya dari ~/.ssh/authorized_keys.
bootstrap_update_runner() {
  local env_file="$PWD/.env"
  if grep -q '^YUI_UPDATE_SSH_TARGET=' "$env_file" 2>/dev/null; then
    echo "==> Update runner already configured (skipping)"
    return 0
  fi
  command -v ssh-keygen >/dev/null 2>&1 || { echo "!! ssh-keygen missing; see DEPLOY.md for manual setup"; return 0; }
  if [ ! -f "$PWD/update_key" ]; then
    echo "==> Generating dedicated SSH key (no passphrase)"
    ssh-keygen -t ed25519 -f "$PWD/update_key" -N "" -C yuika-update-runner >/dev/null
  fi
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  touch "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys"
  local pub
  pub=$(cat "$PWD/update_key.pub")
  grep -qF "$pub" "$HOME/.ssh/authorized_keys" || echo "$pub" >> "$HOME/.ssh/authorized_keys"
  touch "$env_file"
  cat >> "$env_file" <<EOF

# One-click update runner (auto-configured by update.sh)
YUI_UPDATE_SSH_TARGET=$(id -un)@host.docker.internal
YUI_UPDATE_SSH_PORT=22
YUI_UPDATE_DIR=$PWD
YUI_UPDATE_SSH_KEY_FILE=$PWD/update_key
EOF
  echo "==> Update runner configured - 'Update now' button enabled"
}
bootstrap_update_runner

echo "==> Rebuilding (data volume untouched, expect a few minutes)"
docker compose -f "$COMPOSE_FILE" up -d --build

echo "==> Waiting for the API healthcheck (max 120s)"
ok=""
for _ in $(seq 1 24); do
  if docker compose -f "$COMPOSE_FILE" exec -T api \
      node -e "fetch('http://127.0.0.1:3211/api/auth/me').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done
if [ -z "$ok" ]; then
  echo "!! API did not become healthy. Check: docker compose -f $COMPOSE_FILE logs api"
  echo "   Rollback: git checkout $CURRENT && docker compose -f $COMPOSE_FILE up -d --build"
  exit 1
fi

echo "==> Running version:"
docker compose -f "$COMPOSE_FILE" exec -T api \
  node -e "fetch('http://127.0.0.1:3211/api/meta').then(r=>r.json()).then(m=>console.log('    Yuika', m.version, m.updateAvailable ? '(update available: '+m.latest+')' : '(up to date)'))"

echo "==> Done."
