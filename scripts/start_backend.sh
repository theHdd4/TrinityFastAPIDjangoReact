#!/bin/bash
set -e

# Determine which environment to start. Defaults to "dev" if not specified.
ENV="${1:-dev}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

case "$ENV" in
  dev)
    TRAEFIK_NETWORK="trinity_dev_trinity-net" \
    docker compose -f docker-compose.yml -f docker-compose.dev.yml \
      -p trinity_dev up --build
    ;;
  prod)
    TRAEFIK_NETWORK="trinity_prod_trinity-net" \
    docker compose -f docker-compose.yml -f docker-compose.prod.yml \
      -p trinity_prod up --build
    ;;
  *)
    echo "Usage: $0 [dev|prod]" >&2
    exit 1
    ;;
esac
