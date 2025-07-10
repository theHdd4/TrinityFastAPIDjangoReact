#!/usr/bin/env bash
# Start Trinity backend stack from repository root.
set -e
cd "$(dirname "$0")/.."
if [ ! -f host.env ]; then
  cp host.env.example host.env
  echo "Created host.env from example"
fi
docker compose up --build "$@"
