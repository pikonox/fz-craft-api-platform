#!/usr/bin/env bash
#
# One-time setup for an Ubuntu 24.04 server (Oracle Cloud ARM). Run by deploy/push.sh --setup:
#   sudo bash /opt/fz-craft/deploy/server-setup.sh fz-craft.pikonox.com
#
# Installs Node 22, pnpm, Caddy (automatic HTTPS), adds swap, opens ports 80/443 in the
# server firewall, and installs the fz-api / fz-web services. Safe to run again.
#
set -euo pipefail

DOMAIN="${1:-fz-craft.pikonox.com}"
APP_DIR=/opt/fz-craft
APP_USER="${SUDO_USER:-ubuntu}"
export DEBIAN_FRONTEND=noninteractive

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo"; exit 1; }

step "Swap (4 GB) so builds don't run out of memory"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show

step "System packages"
echo "iptables-persistent iptables-persistent/autosave_v4 boolean true" | debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean true" | debconf-set-selections
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync debian-keyring debian-archive-keyring apt-transport-https iptables-persistent >/dev/null

step "Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

step "pnpm 9"
npm install -g pnpm@9.15.9 --silent
pnpm -v

step "Caddy (web server with automatic HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi
caddy version

step "Firewall: allow HTTP (80) and HTTPS (443)"
# Oracle's Ubuntu images reject everything except SSH in iptables, on top of the cloud security list.
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
netfilter-persistent save >/dev/null 2>&1 || iptables-save > /etc/iptables/rules.v4
iptables -L INPUT -n --line-numbers | grep -E 'dpt:(22|80|443)' || true

step "App services (fz-api, fz-web)"
sed "s/__USER__/$APP_USER/g" "$APP_DIR/deploy/fz-api.service" > /etc/systemd/system/fz-api.service
sed "s/__USER__/$APP_USER/g" "$APP_DIR/deploy/fz-web.service" > /etc/systemd/system/fz-web.service
systemctl daemon-reload
systemctl enable fz-api fz-web >/dev/null 2>&1

step "Caddy site for $DOMAIN"
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable caddy >/dev/null 2>&1
systemctl reload caddy || systemctl restart caddy

step "Done"
echo "Server is ready. Services start after the first build (deploy/push.sh does that)."
