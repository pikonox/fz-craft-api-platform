#!/usr/bin/env bash
#
# Keeps asking Oracle Cloud for an Always Free ARM server until one is free, then prints its IP.
#
#   caffeinate -i bash deploy/oracle-grab-server.sh
#
# Needs: the Oracle CLI (brew install oci-cli) and ~/.oci/config with an API key.
# Default size: 2 CPU cores and 8 GB RAM. Change it with environment variables, e.g.
#   OCPUS=1 MEMORY_GB=4 caffeinate -i bash deploy/oracle-grab-server.sh
#
# Always Free servers can only be created in your account's HOME region (Oracle's rule; the home
# region can't be changed). Inside that region the script rotates through every availability
# domain and grabs the first one with free capacity.
#
set -u

NAME="${NAME:-fz-craft}"
SHAPE="VM.Standard.A1.Flex"
OCPUS="${OCPUS:-2}"
MEMORY_GB="${MEMORY_GB:-8}"
SUBNET_NAME="${SUBNET_NAME:-public subnet-fz-craft-vcn}"
WAIT_SECONDS="${WAIT_SECONDS:-60}"
# Always Free ARM allowance (Oracle halved it in 2026): 2 OCPUs and 12 GB in total, across all ARM servers
FREE_MAX_OCPUS=2
FREE_MAX_MEMORY_GB=12
# SSH key: ~/.ssh/fz-craft.pub (make it with: ssh-keygen -t ed25519 -f ~/.ssh/fz-craft -N "") or the newest Oracle-downloaded key
if [ -z "${SSH_KEY_FILE:-}" ]; then
  if [ -f "$HOME/.ssh/fz-craft.pub" ]; then SSH_KEY_FILE="$HOME/.ssh/fz-craft.pub"
  else SSH_KEY_FILE="$(ls -t "$HOME"/Downloads/ssh-key-*.key.pub 2>/dev/null | head -1)"; fi
fi

say() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { printf '\n✗ %s\n' "$*" >&2; exit 1; }
notify() { osascript -e "display notification \"$1\" with title \"Oracle server\" sound name \"Glass\"" >/dev/null 2>&1 || true; }

# ── Checks ──────────────────────────────────────────────
command -v oci >/dev/null 2>&1 || fail "The Oracle CLI isn't installed. Run: brew install oci-cli"
[ -f "$HOME/.oci/config" ] || fail "~/.oci/config is missing. Follow the API key steps first."
[ -n "$SSH_KEY_FILE" ] && [ -f "$SSH_KEY_FILE" ] || fail "No SSH key found. Create one with: ssh-keygen -t ed25519 -f ~/.ssh/fz-craft -N \"\""
if [ "$OCPUS" -gt "$FREE_MAX_OCPUS" ] || [ "$MEMORY_GB" -gt "$FREE_MAX_MEMORY_GB" ]; then
  fail "$OCPUS CPU / $MEMORY_GB GB is above the free limit ($FREE_MAX_OCPUS CPU / $FREE_MAX_MEMORY_GB GB). Oracle would charge for it or shut it down."
fi

TENANCY="$(awk -F'=' '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/, "", $2); print $2; exit}' "$HOME/.oci/config")"
[ -n "$TENANCY" ] || fail "Couldn't read 'tenancy=' from ~/.oci/config"

say "Checking your Oracle login…"
oci iam availability-domain list --compartment-id "$TENANCY" >/dev/null 2>&1 \
  || fail "The Oracle CLI can't log in. Run 'oci iam region list' to see the error (usually a wrong key_file path or fingerprint)."

HOME_REGION="$(oci iam region-subscription list --query 'data[?"is-home-region"]."region-name" | [0]' --raw-output 2>/dev/null)"
# Every availability domain in the home region (most regions have 1, some have 3)
ADS=($(oci iam availability-domain list --compartment-id "$TENANCY" --query 'data[].name' --output json 2>/dev/null | tr -d '[]", ' | grep -v '^$'))
[ ${#ADS[@]} -gt 0 ] || fail "Couldn't list availability domains."
SUBNET="$(oci network subnet list --compartment-id "$TENANCY" --all --query "data[?\"display-name\"=='$SUBNET_NAME'].id | [0]" --raw-output 2>/dev/null)"
[ -n "$SUBNET" ] && [ "$SUBNET" != "null" ] || fail "Subnet '$SUBNET_NAME' not found. Check the name under Networking → Virtual cloud networks → Subnets."
IMAGE="$(oci compute image list --compartment-id "$TENANCY" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape "$SHAPE" \
  --sort-by TIMECREATED --sort-order DESC --all --query "data[?!contains(\"display-name\", 'Minimal')].id | [0]" --raw-output 2>/dev/null)"
[ -n "$IMAGE" ] && [ "$IMAGE" != "null" ] || fail "Couldn't find an Ubuntu 24.04 ARM image."

EXISTING="$(oci compute instance list --compartment-id "$TENANCY" --display-name "$NAME" \
  --query "data[?\"lifecycle-state\"!='TERMINATED' && \"lifecycle-state\"!='TERMINATING'].id | [0]" --raw-output 2>/dev/null)"
if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ]; then
  fail "An instance called '$NAME' already exists. Nothing to do — find its IP under Compute → Instances."
fi

say "Home region   : ${HOME_REGION:-unknown} (free servers are only allowed here)"
say "Zones to try  : ${#ADS[@]} — ${ADS[*]}"
say "Shape         : $SHAPE ($OCPUS CPU, $MEMORY_GB GB RAM)"
say "Subnet        : $SUBNET_NAME"
say "SSH key       : $SSH_KEY_FILE"
say "Trying every zone, then waiting ${WAIT_SECONDS}s. Leave this window open; press Ctrl+C to stop."
echo

# ── Retry loop ──────────────────────────────────────────
existing_id() {
  oci compute instance list --compartment-id "$TENANCY" --display-name "$NAME" \
    --query "data[?\"lifecycle-state\"=='PROVISIONING' || \"lifecycle-state\"=='STARTING' || \"lifecycle-state\"=='RUNNING'].id | [0]" --raw-output 2>/dev/null
}

success() { # $1 = instance id, $2 = zone
  local IP PRIVATE_KEY
  IP="$(oci compute instance list-vnics --instance-id "$1" --query 'data[0]."public-ip"' --raw-output 2>/dev/null)"
  PRIVATE_KEY="${SSH_KEY_FILE%.pub}"
  echo
  say "✓ Got it on attempt $attempt in ${2##*:}! Your server is RUNNING ($OCPUS CPU, $MEMORY_GB GB)."
  say "  Public IP: ${IP:-(still starting — check Compute → Instances)}"
  say "  Log in:    chmod 600 \"$PRIVATE_KEY\" && ssh -i \"$PRIVATE_KEY\" ubuntu@$IP"
  notify "Server ready: $IP"
  exit 0
}

attempt=0
while true; do
  attempt=$((attempt + 1))
  throttled=0
  for AD in "${ADS[@]}"; do
    # Never create a second server: if an earlier attempt succeeded but timed out while waiting, stop here
    if [ $attempt -gt 1 ] || [ "$AD" != "${ADS[0]}" ]; then
      FOUND="$(existing_id)"
      if [ -n "$FOUND" ] && [ "$FOUND" != "null" ]; then success "$FOUND" "$AD"; fi
    fi

    OUT="$(oci --no-retry compute instance launch \
      --compartment-id "$TENANCY" \
      --availability-domain "$AD" \
      --display-name "$NAME" \
      --shape "$SHAPE" \
      --shape-config "{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEMORY_GB}" \
      --image-id "$IMAGE" \
      --subnet-id "$SUBNET" \
      --assign-public-ip true \
      --ssh-authorized-keys-file "$SSH_KEY_FILE" \
      --wait-for-state RUNNING --max-wait-seconds 900 \
      --query 'data.id' --raw-output 2>&1)"
    CODE=$?
    ZONE="${AD##*:}"

    if [ $CODE -eq 0 ] && printf '%s' "$OUT" | grep -q '^ocid1\.instance'; then
      success "$(printf '%s' "$OUT" | grep '^ocid1\.instance' | head -1)" "$AD"
    fi

    if printf '%s' "$OUT" | grep -qi 'capacity'; then
      say "Attempt $attempt · $ZONE: no free capacity yet"
    elif printf '%s' "$OUT" | grep -qiE 'TooManyRequests|429'; then
      say "Attempt $attempt · $ZONE: Oracle asked us to slow down"
      throttled=1
      break
    elif printf '%s' "$OUT" | grep -qiE 'LimitExceeded|QuotaExceeded'; then
      notify "Stopped: free limit reached"
      fail "Oracle says your free ARM limit is used (maybe another ARM server already exists — the free total is $FREE_MAX_OCPUS CPU / $FREE_MAX_MEMORY_GB GB). Details:
$OUT"
    else
      say "Attempt $attempt · $ZONE: unexpected error"
      printf '%s\n' "$OUT" | tail -5 | sed 's/^/    /'
    fi
    # Small gap between zones so Oracle doesn't throttle us
    [ ${#ADS[@]} -gt 1 ] && sleep 5
  done

  if [ $throttled -eq 1 ]; then
    say "Waiting 3 minutes (normal, it keeps going)"
    sleep 180
  else
    sleep "$WAIT_SECONDS"
  fi
done
