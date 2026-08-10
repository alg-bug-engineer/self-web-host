#!/usr/bin/env bash
set -Eeuo pipefail

cd /root/self-web-host
exec bash scripts/deploy.sh origin/main
