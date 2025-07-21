#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Start the development services

docker compose -f docker-compose-dev.yml -p trinity-dev up -d

# Start the Cloudflare tunnel for the dev domain
if [ -f cloudflared-dev/docker-compose.yml ]; then
  docker compose -f cloudflared-dev/docker-compose.yml -p trinity-dev up -d
fi

echo "Dev stack started. Access it via http://localhost:8081 or https://trinity-dev.quantmatrixai.com"
