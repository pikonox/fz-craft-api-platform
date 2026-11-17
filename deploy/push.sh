#!/usr/bin/env bash
#
# Deploy fz-craft from this Mac to the server. Server settings (SSH user, nginx or Caddy, ports,
# domain) are in deploy/server.conf.
#
#   First time:   bash deploy/push.sh SERVER_IP --setup     (installs everything + creates the server .env)
#   Every update: bash deploy/push.sh SERVER_IP             (uploads code, builds, restarts)
#   New .env:     bash deploy/push.sh SERVER_IP --env       (re-creates the server .env from your local one)
#
# Add --git to take the code from GitHub instead of this Mac: the server clones the repository the
# first time and pulls the latest main after that (push your changes to GitHub first). The .env is
# never on GitHub, so it is always copied from this Mac.
#   bash deploy/push.sh SERVER_IP --setup --git
#
# Before the first run, let this Mac log in with its key (asks for the server password once):
#   ssh-copy-id -i ~/.ssh/fz-craft.pub root@SERVER_IP
#
# Optional environment: SSH_KEY (default ~/.ssh/fz-craft), CERTBOT_EMAIL (certificate expiry notices)
#
set -euo pipefail

HOST="${1:-}"
[ -n "$HOST" ] || { echo "Usage: bash deploy/push.sh SERVER_IP [--setup] [--env] [--git]"; exit 1; }
shift
SETUP=0
ENVFILE=0
FROM_GIT=0
for arg in "$@"; do
  case "$arg" in
    --setup) SETUP=1; ENVFILE=1 ;;
    --env) ENVFILE=1 ;;
    --git) FROM_GIT=1 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Defaults suit a fresh server; deploy/server.conf overrides them
SSH_USER=ubuntu
PROXY=caddy
WEB_PORT=3000
API_PORT=4000
DOMAIN=fzcraft.pikonox.com
# shellcheck source=/dev/null
[ -f "$ROOT/deploy/server.conf" ] && . "$ROOT/deploy/server.conf"

KEY="${SSH_KEY:-$HOME/.ssh/fz-craft}"
REPO="${REPO:-https://github.com/pikonox/fz-craft-api-platform.git}"
REMOTE=/opt/fz-craft
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30)
SUDO=$([ "$SSH_USER" = root ] && echo "" || echo "sudo")
# The services run as the SSH user, or as a dedicated "fzcraft" user when we log in as root
APP_USER=$([ "$SSH_USER" = root ] && echo fzcraft || echo "$SSH_USER")

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
remote() { ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "$@"; }

[ -f "$ROOT/.env" ] || { echo "Missing $ROOT/.env"; exit 1; }
[ -f "$KEY" ] || { echo "SSH key not found: $KEY (create it with: ssh-keygen -t ed25519 -f ~/.ssh/fz-craft -N \"\")"; exit 1; }

step "Connecting to $HOST as $SSH_USER ($PROXY, website :$WEB_PORT, API :$API_PORT)"
if ! ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=15 "$SSH_USER@$HOST" true 2>/dev/null; then
  echo "Can't log in to $SSH_USER@$HOST with the key $KEY."
  echo "Run this once (it asks for the server password), then try again:"
  echo "  ssh-copy-id -i $KEY.pub $SSH_USER@$HOST"
  exit 1
fi
remote "$SUDO mkdir -p $REMOTE && $SUDO chown \$(id -un):\$(id -gn) $REMOTE && echo connected as \$(id -un)"

if [ "$FROM_GIT" -eq 1 ]; then
  step "Getting the code from GitHub ($REPO, branch main)"
  # First time: clone into the (empty) folder. After that: move to the latest main. Untracked files
  # such as .env, node_modules and build output are left alone.
  remote "command -v git >/dev/null || { $SUDO apt-get update -qq && $SUDO apt-get install -y -qq git; }
    if [ -d $REMOTE/.git ]; then
      git -C $REMOTE fetch -q origin main && git -C $REMOTE reset -q --hard origin/main
    elif [ -z \"\$(ls -A $REMOTE)\" ]; then
      git clone -q --branch main $REPO $REMOTE
    else
      echo '$REMOTE already has files but is not a git clone. Deploy once without --git, or empty the folder.'; exit 1
    fi
    git -C $REMOTE log --oneline -1"
else
  step "Uploading code"
  rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
    --exclude node_modules --exclude .next --exclude dist --exclude .turbo --exclude .git \
    --exclude storage --exclude .env --exclude '*.log' --exclude .DS_Store \
    "$ROOT/" "$SSH_USER@$HOST:$REMOTE/"
fi

if [ "$ENVFILE" -eq 1 ]; then
  step "Creating the server .env (production values)"
  TMP="$(mktemp)"
  trap 'rm -f "$TMP"' EXIT
  # Same secrets as your local .env (the shared database needs the same ENCRYPTION_KEY),
  # with production URLs and ports, NODE_ENV=production and the dev mock provider switched off.
  python3 - "$ROOT/.env" "$DOMAIN" "$API_PORT" >"$TMP" <<'PY'
import sys
src, domain, api_port = sys.argv[1], sys.argv[2], sys.argv[3]
over = {
    "NODE_ENV": "production",
    "APP_URL": f"https://{domain}",
    "PUBLIC_API_BASE_URL": f"https://{domain}/v1",
    "NEXT_PUBLIC_API_BASE_URL": f"https://{domain}/v1",
    # The API only listens inside the server; nginx/Caddy forwards to it
    "API_PORT": api_port,
    "API_HOST": "127.0.0.1",
    "API_INTERNAL_URL": f"http://127.0.0.1:{api_port}",
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
  scp -q "${SSH_OPTS[@]}" "$TMP" "$SSH_USER@$HOST:$REMOTE/.env"
  remote "chmod 600 $REMOTE/.env"
  echo "Server .env written (production, https://$DOMAIN, API on 127.0.0.1:$API_PORT, files in /var/lib/fz-craft/storage)"
fi

if [ "$SETUP" -eq 1 ]; then
  step "One-time server setup ($PROXY) — takes a few minutes"
  remote "$SUDO env PROXY=$PROXY WEB_PORT=$WEB_PORT API_PORT=$API_PORT CERTBOT_EMAIL=${CERTBOT_EMAIL:-} bash $REMOTE/deploy/server-setup.sh $DOMAIN"
fi

step "Installing packages and building (2–5 minutes)"
remote "cd $REMOTE && pnpm install --frozen-lockfile && pnpm build"

step "Permissions for the $APP_USER service user"
# It reads .env and writes only the Next.js cache and the file storage folder
remote "$SUDO chown $SSH_USER:$APP_USER $REMOTE/.env && $SUDO chmod 640 $REMOTE/.env \
  && $SUDO chown -R $APP_USER: $REMOTE/apps/web/.next && $SUDO mkdir -p /var/lib/fz-craft/storage && $SUDO chown -R $APP_USER: /var/lib/fz-craft && echo ok"

step "Restarting fz-api and fz-web"
remote "$SUDO systemctl restart fz-api fz-web && sleep 6 && systemctl is-active fz-api fz-web"

step "Health check"
remote "curl -fsS http://127.0.0.1:$API_PORT/api/status && echo && curl -fsS -o /dev/null -w 'website: HTTP %{http_code}\n' http://127.0.0.1:$WEB_PORT/" \
  || { echo "Something isn't healthy. Logs: ssh -i $KEY $SSH_USER@$HOST 'journalctl -u fz-api -u fz-web -n 80 --no-pager'"; exit 1; }

step "Database speed from the server"
remote "cd $REMOTE && node deploy/db-check.mjs" || echo "(couldn't measure — check MongoDB Atlas → Network Access allows $HOST)"

step "Live"
if [ "$PROXY" = "nginx" ]; then
  echo "https://$DOMAIN"
  echo "(If HTTPS isn't on yet: point the DNS A record at $HOST, then run on the server: sudo certbot --nginx -d $DOMAIN --redirect)"
else
  echo "https://$DOMAIN  (the HTTPS certificate is issued automatically on the first visit once DNS points here)"
fi
