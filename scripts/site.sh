#!/usr/bin/env bash
# Serve the website in site/ on localhost. It is static files; there is no build step.
#
#   scripts/site.sh            # http://localhost:4173
#   scripts/site.sh 8080
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-4173}"
echo "GroupCart site: http://localhost:${PORT}"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT/site"
