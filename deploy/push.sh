#!/usr/bin/env bash
#
# Deploy fz-craft from this Mac to the server.
#
#   First time:   bash deploy/push.sh SERVER_IP --setup     (installs everything + creates the server .env)
#   Every update: bash deploy/push.sh SERVER_IP             (uploads code, builds, restarts)
#   New .env:     bash deploy/push.sh SERVER_IP --env       (re-creates the server .env from your local one)
#
# Options via environment: SSH_KEY (default ~/.ssh/fz-craft), DOMAIN (default fz-craft.pikonox.com)
#
set -euo pipefail

HOST="${1:-}"
[ -n "$HOST" ] || { echo "Usage: bash deploy/push.sh SERVER_IP [--setup] [--env]"; exit 1; }
shift
SETUP=0
ENVFILE=0
for arg in "$@"; do
  case "$arg" in
    --setup) SETUP=1; ENVFILE=1 ;;
    --env) ENVFILE=1 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

KEY="${SSH_KEY:-$HOME/.ssh/fz-craft}"
DOMAIN="${DOMAIN:-fz-craft.pikonox.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE=/opt/fz-craft
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30)

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
remote() { ssh "${SSH_OPTS[@]}" "ubuntu@$HOST" "$@"; }

[ -f "$KEY" ] || { echo "SSH key not found: $KEY"; exit 1; }
[ -f "$ROOT/.env" ] || { echo "Missing $ROOT/.env"; exit 1; }

step "Connecting to $HOST"
remote "sudo mkdir -p $REMOTE && sudo chown \$(id -un):\$(id -gn) $REMOTE && echo connected as \$(id -un)"
# Files (images, payment screenshots, attachments) are kept here across deploys
remote "sudo mkdir -p /var/lib/fz-craft/storage && sudo chown -R \$(id -un):\$(id -gn) /var/lib/fz-craft"

step "Uploading code"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude .next --exclude dist --exclude .turbo \
  --exclude storage --exclude .env --exclude '*.log' --exclude .DS_Store \
  "$ROOT/" "ubuntu@$HOST:$REMOTE/"

if [ "$ENVFILE" -eq 1 ]; then
  step "Creating the server .env (production values)"
  TMP="$(mktemp)"
  trap 'rm -f "$TMP"' EXIT
  # Same secrets as your local .env (the shared database needs the same ENCRYPTION_KEY),
  # with production URLs, NODE_ENV=production and the dev mock provider switched off.
  python3 - "$ROOT/.env" "$DOMAIN" > "$TMP" <<'PY'
import sys
src, domain = sys.argv[1], sys.argv[2]
over = {
    "NODE_ENV": "production",
    "APP_URL": f"https://{domain}",
    "PUBLIC_API_BASE_URL": f"https://{domain}/v1",
    "API_INTERNAL_URL": "http://127.0.0.1:4000",
    "ENABLE_MOCK_PROVIDER": "false",
    # Uploaded and generated files live on the server's disk, outside the code folder,
    # so redeploys never touch them
    "STORAGE_DRIVER": "local",
    "STORAGE_LOCAL_DIR": "/var/lib/fz-craft/storage",
}
seen = set()
for line in open(src).read().splitlines():
    key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else None
    if key in over:
        print(f"{key}={over[key]}")
        seen.add(key)
    else:
        print(line)
for k, v in over.items():
    if k not in seen:
        print(f"{k}={v}")
PY
  scp -q "${SSH_OPTS[@]}" "$TMP" "ubuntu@$HOST:$REMOTE/.env"
  remote "chmod 600 $REMOTE/.env"
  echo "Server .env written (NODE_ENV=production, APP_URL=https://$DOMAIN, mock provider off, files in /var/lib/fz-craft/storage)"
fi

if [ "$SETUP" -eq 1 ]; then
  step "One-time server setup (Node, pnpm, Caddy, firewall, services) — takes a few minutes"
  remote "sudo bash $REMOTE/deploy/server-setup.sh $DOMAIN"
fi

step "Installing packages and building (2–5 minutes)"
remote "cd $REMOTE && pnpm install --frozen-lockfile && pnpm build"

step "Restarting fz-api and fz-web"
remote "sudo systemctl restart fz-api fz-web && sleep 6 && systemctl is-active fz-api fz-web"

step "Health check"
remote "curl -fsS http://127.0.0.1:4000/api/status && echo && curl -fsS -o /dev/null -w 'website: HTTP %{http_code}\n' http://127.0.0.1:3000/" \
  || { echo "Something isn't healthy. Logs: ssh -i $KEY ubuntu@$HOST 'journalctl -u fz-api -u fz-web -n 80 --no-pager'"; exit 1; }

step "Live"
echo "https://$DOMAIN  (the HTTPS certificate is issued automatically on the first visit once DNS points here)"
