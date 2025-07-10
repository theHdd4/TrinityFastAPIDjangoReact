#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ ! -f host.env ]; then
  cp host.env.example host.env
  echo "Copied host.env.example to host.env. Edit HOST_IP if needed." >&2
fi
docker compose up --build
