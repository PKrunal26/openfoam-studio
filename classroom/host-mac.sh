#!/usr/bin/env bash
# Host the classroom on this Mac and publish it on your own domain through a
# Cloudflare Tunnel (HTTPS, no router changes, home address stays private).
#
#   bash classroom/host-mac.sh                 # serves https://openfoamstudio.online
#   OFS_PUBLIC_DOMAIN=cfd.example.org bash classroom/host-mac.sh
#   OFS_NO_TUNNEL=1 bash classroom/host-mac.sh # local network only, port 8080
#
# Needs: Node 22, Docker Desktop (running), and for the tunnel `cloudflared`
# plus the domain's nameservers pointed at Cloudflare. See docs/CLASSROOM.md.
set -euo pipefail

DOMAIN="${OFS_PUBLIC_DOMAIN:-openfoamstudio.online}"
TUNNEL="${OFS_TUNNEL_NAME:-ofs-classroom}"
PORT="${OFS_CLASSROOM_PORT:-8080}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/classroom/.env"
cd "$ROOT"

fail() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is not installed. $2"; }

need node "Install Node 22 (brew install node@22)."
need docker "Install Docker Desktop and start it."
docker info >/dev/null 2>&1 || fail "Docker is not running. Start Docker Desktop and try again."
if [ -z "${OFS_NO_TUNNEL:-}" ]; then
  need cloudflared "Install it with: brew install cloudflared"
fi

# First run: create the settings file with random class and instructor codes.
if [ ! -f "$ENV_FILE" ]; then
  code() { LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c "$1" || true; }
  umask 077
  {
    echo "OFS_CLASS_NAME=\"CFD with OpenFOAM\""
    echo "OFS_CLASS_CODE=$(code 8)"
    echo "OFS_INSTRUCTOR_CODE=$(code 16)"
    echo "OFS_MAX_CONCURRENT_RUNS=2"
  } >"$ENV_FILE"
  echo "Created $ENV_FILE with new class and instructor codes."
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
export OFS_CLASSROOM_PORT="$PORT"
if [ -z "${OFS_NO_TUNNEL:-}" ]; then
  export OFS_SECURE_COOKIES=1 OFS_TRUST_PROXY=1
fi

[ -d node_modules ] || npm ci
npm run classroom:build

if [ -z "${OFS_NO_TUNNEL:-}" ]; then
  # One-time: sign in to Cloudflare (opens a browser), create the tunnel, and
  # point the domain at it.
  [ -f "$HOME/.cloudflared/cert.pem" ] || cloudflared tunnel login
  cloudflared tunnel info "$TUNNEL" >/dev/null 2>&1 || cloudflared tunnel create "$TUNNEL"
  cloudflared tunnel route dns --overwrite-dns "$TUNNEL" "$DOMAIN"
fi

node classroom/dist/server.js &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

# Keep the Mac awake for as long as the server runs.
if command -v caffeinate >/dev/null 2>&1; then caffeinate -s -w "$SERVER_PID" & fi

echo
echo "Class code:      $OFS_CLASS_CODE"
echo "Instructor code: $OFS_INSTRUCTOR_CODE   (instructor page: /admin)"
if [ -n "${OFS_NO_TUNNEL:-}" ]; then
  echo "Serving on http://localhost:$PORT (local network only). Ctrl+C stops it."
  wait "$SERVER_PID"
else
  echo "Serving on https://$DOMAIN  Ctrl+C stops it."
  cloudflared tunnel run --url "http://localhost:$PORT" "$TUNNEL"
fi
