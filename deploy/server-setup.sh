#!/usr/bin/env bash
#
# One-time setup for an Ubuntu server. Run by deploy/push.sh --setup:
#   sudo PROXY=nginx WEB_PORT=3100 API_PORT=4100 bash /opt/fz-craft/deploy/server-setup.sh fzcraft.pikonox.com
#
# PROXY=nginx  The server already runs nginx (shared with other sites). Adds an nginx site for
#              FZ-craft and a free HTTPS certificate (certbot). Does NOT change Node, the firewall or
#              any other site.
# PROXY=caddy  A fresh server (e.g. Oracle Cloud). Installs Node 22 and Caddy (automatic HTTPS) and
#              opens ports 80/443 in iptables.
#
# Both: adds swap if there is none, installs pnpm, creates the file storage folder and installs the
# fz-api / fz-web services. Safe to run again.
#
set -euo pipefail

DOMAIN="${1:-fzcraft.pikonox.com}"
PROXY="${PROXY:-caddy}"
WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-4000}"
APP_DIR=/opt/fz-craft
STORAGE_DIR=/var/lib/fz-craft/storage
export DEBIAN_FRONTEND=noninteractive

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "Run with sudo"
case "$PROXY" in nginx | caddy) ;; *) fail "PROXY must be nginx or caddy" ;; esac

# The services run as a normal user, never as root: the SSH user when it isn't root (e.g. ubuntu),
# otherwise a dedicated system user "fzcraft".
if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
  APP_USER="$SUDO_USER"
else
  APP_USER=fzcraft
  id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi
echo "Services will run as: $APP_USER"

step "Swap"
if [ -z "$(swapon --show --noheadings)" ]; then
  ram_gb=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
  size=$([ "$ram_gb" -lt 6 ] && echo 4G || echo 2G)
  fallocate -l "$size" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo "Added $size swap"
fi
swapon --show

step "System packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates rsync >/dev/null

step "Node.js"
node_major=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)
if [ -z "$node_major" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
elif [ "$node_major" -lt 22 ]; then
  if [ "$PROXY" = "nginx" ]; then
    fail "Node $(node -v) is installed and other apps on this server use it. FZ-craft needs Node 22+. Upgrade Node yourself when it's safe for the other apps, then run this again."
  fi
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

step "pnpm 9"
[ "$(pnpm -v 2>/dev/null || true)" = "9.15.9" ] || npm install -g pnpm@9.15.9 --silent
pnpm -v

step "File storage folder ($STORAGE_DIR)"
mkdir -p "$STORAGE_DIR"
chown -R "$APP_USER:" /var/lib/fz-craft
ls -ld "$STORAGE_DIR"

step "Checking ports $WEB_PORT and $API_PORT are free"
for port in "$WEB_PORT" "$API_PORT"; do
  owner=$(ss -ltnp "sport = :$port" 2>/dev/null | awk 'NR>1 {print $NF}' | head -1)
  if [ -n "$owner" ] && ! systemctl is-active --quiet fz-api fz-web 2>/dev/null; then
    fail "Port $port is already used by: $owner. Pick other ports in deploy/server.conf."
  fi
done
echo "ok"

step "App services (fz-api on $API_PORT, fz-web on $WEB_PORT)"
sed "s/__USER__/$APP_USER/g" "$APP_DIR/deploy/fz-api.service" >/etc/systemd/system/fz-api.service
sed -e "s/__USER__/$APP_USER/g" -e "s/__WEB_PORT__/$WEB_PORT/g" "$APP_DIR/deploy/fz-web.service" >/etc/systemd/system/fz-web.service
systemctl daemon-reload
systemctl enable fz-api fz-web >/dev/null 2>&1
echo "installed"

if [ "$PROXY" = "nginx" ]; then
  step "nginx site for $DOMAIN"
  command -v nginx >/dev/null || apt-get install -y -qq nginx >/dev/null
  if grep -q "sites-enabled" /etc/nginx/nginx.conf; then
    site=/etc/nginx/sites-available/fz-craft.conf
    link=/etc/nginx/sites-enabled/fz-craft.conf
  else
    site=/etc/nginx/conf.d/fz-craft.conf
    link=""
  fi
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__WEB_PORT__/$WEB_PORT/g" -e "s/__API_PORT__/$API_PORT/g" "$APP_DIR/deploy/nginx-fz-craft.conf" >"$site.new"
  # Keep the HTTPS part certbot added on an earlier run
  if [ -f "$site" ] && grep -q "managed by Certbot" "$site"; then
    echo "Keeping the existing HTTPS settings in $site"
    rm -f "$site.new"
  else
    mv "$site.new" "$site"
  fi
  [ -n "$link" ] && ln -sf "$site" "$link"
  if ! nginx -t 2>/tmp/fz-nginx-test.txt; then
    cat /tmp/fz-nginx-test.txt
    [ -n "$link" ] && rm -f "$link" || rm -f "$site"
    fail "nginx rejected the FZ-craft site, so it was removed again. Your other sites are unchanged."
  fi
  systemctl reload nginx
  echo "nginx reloaded (other sites untouched)"

  step "HTTPS certificate (Let's Encrypt)"
  command -v certbot >/dev/null || apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  dpkg -s python3-certbot-nginx >/dev/null 2>&1 || apt-get install -y -qq python3-certbot-nginx >/dev/null
  server_ip=$(curl -4 -s --max-time 5 ifconfig.me || true)
  dns_ip=$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}' || true)
  if [ -n "$dns_ip" ] && [ "$dns_ip" = "$server_ip" ]; then
    if [ -n "${CERTBOT_EMAIL:-}" ]; then email=(-m "$CERTBOT_EMAIL"); else email=(--register-unsafely-without-email); fi
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect "${email[@]}" \
      || echo "! certbot failed. Run it again later: sudo certbot --nginx -d $DOMAIN"
  else
    echo "! $DOMAIN points to '${dns_ip:-nothing}', not this server ($server_ip)."
    echo "  Add a DNS A record: ${DOMAIN%%.*} → $server_ip (DNS only / grey cloud), wait a few minutes, then run:"
    echo "  sudo certbot --nginx -d $DOMAIN --redirect"
  fi
else
  step "Caddy (web server with automatic HTTPS)"
  apt-get install -y -qq gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  if ! command -v caddy >/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy >/dev/null
  fi
  caddy version

  step "Firewall: allow HTTP (80) and HTTPS (443)"
  # Oracle's Ubuntu images reject everything except SSH in iptables, on top of the cloud security list.
  echo "iptables-persistent iptables-persistent/autosave_v4 boolean true" | debconf-set-selections
  echo "iptables-persistent iptables-persistent/autosave_v6 boolean true" | debconf-set-selections
  apt-get install -y -qq iptables-persistent >/dev/null
  for port in 80 443; do
    if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
      reject_line="$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')"
      if [ -n "$reject_line" ]; then
        iptables -I INPUT "$reject_line" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
      else
        iptables -A INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT
      fi
    fi
  done
  netfilter-persistent save >/dev/null 2>&1 || iptables-save >/etc/iptables/rules.v4

  step "Caddy site for $DOMAIN"
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__WEB_PORT__/$WEB_PORT/g" -e "s/__API_PORT__/$API_PORT/g" "$APP_DIR/deploy/Caddyfile" >/etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  systemctl enable caddy >/dev/null 2>&1
  systemctl reload caddy || systemctl restart caddy
fi

step "Done"
echo "Server is ready. The services start after the first build (deploy/push.sh does that)."
