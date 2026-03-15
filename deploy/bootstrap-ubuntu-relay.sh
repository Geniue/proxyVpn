#!/usr/bin/env bash

set -euo pipefail

COUNTRY_CODE="${1:-}"
SIGNALING_URL="${2:-}"
REPO_URL="${REPO_URL:-https://github.com/Geniue/proxyVpn.git}"
APP_DIR="${APP_DIR:-/home/ubuntu/proxyVpn}"
APP_USER="${APP_USER:-ubuntu}"
PROXY_PORT="${RELAY_AGENT_PROXY_PORT:-1080}"
CONTROL_PORT="${RELAY_AGENT_CONTROL_PORT:-9900}"

if [[ -z "${COUNTRY_CODE}" || -z "${SIGNALING_URL}" ]]; then
  echo "Usage: bootstrap-ubuntu-relay.sh <COUNTRY_CODE> <SIGNALING_URL>"
  echo "Example: bootstrap-ubuntu-relay.sh SE http://51.20.141.138:3000"
  exit 1
fi

sudo apt update
sudo apt install -y ca-certificates curl gnupg git
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"
git pull --ff-only origin main
npm ci
npm run build:relay-agent

cat > "${APP_DIR}/deploy/relay-agent.env" <<EOF
RELAY_AGENT_COUNTRY=${COUNTRY_CODE}
RELAY_AGENT_SIGNALING_URL=${SIGNALING_URL}
RELAY_AGENT_PROXY_BIND_HOST=0.0.0.0
RELAY_AGENT_PROXY_PORT=${PROXY_PORT}
RELAY_AGENT_CONTROL_BIND_HOST=127.0.0.1
RELAY_AGENT_CONTROL_PORT=${CONTROL_PORT}
EOF

sudo cp "${APP_DIR}/deploy/relay-agent.service" /etc/systemd/system/relay-agent.service
sudo systemctl daemon-reload
sudo systemctl enable relay-agent
sudo systemctl restart relay-agent
sudo systemctl status relay-agent --no-pager

echo
echo "Relay bootstrap completed for ${COUNTRY_CODE}."
echo "Verify with:"
echo "  curl http://127.0.0.1:${CONTROL_PORT}/health"