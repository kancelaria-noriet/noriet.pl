#!/bin/bash
# Dev server on the tailscale interface only (testing phase — no public serving).
cd "$(dirname "$0")"
eval "$("$HOME/.local/share/fnm/fnm" env)"
export NORIET_HOST="${NORIET_HOST:-$(tailscale ip -4 2>/dev/null || echo 127.0.0.1)}"
export NORIET_PORT="${NORIET_PORT:-8085}"
echo "Serving on http://${NORIET_HOST}:${NORIET_PORT}/"
exec npx @11ty/eleventy --serve --port "$NORIET_PORT"
