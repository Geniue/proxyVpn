#!/usr/bin/env bash

set -euo pipefail

COUNTRY_CODE="${1:-}"
SIGNALING_URL="${2:-}"
REPO_URL="${REPO_URL:-https://github.com/Geniue/proxyVpn.git}"
PROXY_PORT="${RELAY_AGENT_PROXY_PORT:-1080}"
CONTROL_PORT="${RELAY_AGENT_CONTROL_PORT:-9900}"

detect_app_user() {
  if [[ -n "${APP_USER:-}" ]]; then
    printf '%s\n' "${APP_USER}"
    return
  fi

  if id -u ubuntu >/dev/null 2>&1; then
    printf '%s\n' "ubuntu"
    return
  fi

  if id -u ec2-user >/dev/null 2>&1; then
    printf '%s\n' "ec2-user"
    return
  fi

  printf '%s\n' "root"
}

APP_USER="$(detect_app_user)"
APP_HOME="$(getent passwd "${APP_USER}" | cut -d: -f6)"
APP_DIR="${APP_DIR:-${APP_HOME}/proxyVpn}"

run_as_app_user() {
  if [[ "${APP_USER}" = "root" ]]; then
    "$@"
    return
  fi

  runuser -u "${APP_USER}" -- "$@"
}

if [[ -z "${COUNTRY_CODE}" || -z "${SIGNALING_URL}" ]]; then
  echo "Usage: bootstrap-ubuntu-relay.sh <COUNTRY_CODE> <SIGNALING_URL>"
  echo "Example: bootstrap-ubuntu-relay.sh SE http://51.20.141.138:3000"
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg git
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y ca-certificates git
  if ! command -v curl >/dev/null 2>&1; then
    dnf install -y curl-minimal
  fi
  curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
  dnf install -y nodejs
else
  echo "Unsupported package manager. Expected apt-get or dnf." >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  run_as_app_user git clone "${REPO_URL}" "${APP_DIR}"
else
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" || true
fi

cd "${APP_DIR}"
run_as_app_user git config --global --add safe.directory "${APP_DIR}"
run_as_app_user git pull --ff-only origin main
run_as_app_user npm ci
run_as_app_user npm run build:relay-agent

cat > "${APP_DIR}/deploy/relay-agent.env" <<EOF
RELAY_AGENT_COUNTRY=${COUNTRY_CODE}
RELAY_AGENT_SIGNALING_URL=${SIGNALING_URL}
RELAY_AGENT_PROXY_BIND_HOST=0.0.0.0
RELAY_AGENT_PROXY_PORT=${PROXY_PORT}
RELAY_AGENT_CONTROL_BIND_HOST=127.0.0.1
RELAY_AGENT_CONTROL_PORT=${CONTROL_PORT}
EOF

cat > /etc/systemd/system/relay-agent.service <<EOF
[Unit]
Description=Relay Mesh Relay Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/deploy/relay-agent.env
ExecStart=/usr/bin/node ${APP_DIR}/apps/relay-agent/dist/index.js
Restart=always
RestartSec=5
User=${APP_USER}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable relay-agent
systemctl restart relay-agent
systemctl status relay-agent --no-pager

echo
echo "Relay bootstrap completed for ${COUNTRY_CODE}."
echo "Verify with:"
echo "  curl http://127.0.0.1:${CONTROL_PORT}/health"