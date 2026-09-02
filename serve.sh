#!/bin/bash
# Dev server. Binds to 127.0.0.1 by default; set NORIET_HOST to expose it on
# another interface (testing phase — no public serving).
cd "$(dirname "$0")"
eval "$("$HOME/.local/share/fnm/fnm" env)"
export NORIET_HOST="${NORIET_HOST:-127.0.0.1}"
export NORIET_PORT="${NORIET_PORT:-8085}"
echo "Serving on http://${NORIET_HOST}:${NORIET_PORT}/"
exec npx @11ty/eleventy --serve --port "$NORIET_PORT"
