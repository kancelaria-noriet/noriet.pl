#!/bin/bash
# Dev server. Binds to 127.0.0.1 by default; set NORIET_HOST to another
# address of this machine (testing phase — never a public interface).
#
# Eleventy's own dev server (`eleventy --serve`) has no bind-address option
# and listens on every interface; on a host with a public address that is a
# public bind (found 2026-09-12). So this script runs Eleventy in watch mode
# for the rebuilds and serves _site with the stdlib static server, which
# binds to exactly one address. Trade-off: no live reload — refresh the tab.
# Like the Eleventy server, it applies neither _redirects nor _headers; the
# Cloudflare preview is the place to verify those.
cd "$(dirname "$0")"
eval "$("$HOME/.local/share/fnm/fnm" env)"
# Local serving is always a development build (sitewide noindex): the
# production output is the DEFAULT since 2026-09-08, so it must be opted out.
export NORIET_ENV="${NORIET_ENV:-development}"
NORIET_HOST="${NORIET_HOST:-127.0.0.1}"
NORIET_PORT="${NORIET_PORT:-8085}"

# A blocking development build first: _site may hold a production build from
# ./build.sh, and the static server must never serve that on the dev host.
npx @11ty/eleventy --quiet
npx @11ty/eleventy --watch --quiet &
WATCH=$!
trap 'kill "$WATCH" 2>/dev/null' INT TERM EXIT
echo "Serving _site on http://${NORIET_HOST}:${NORIET_PORT}/ (development build, watch without live reload)"
python3 -m http.server "$NORIET_PORT" --bind "$NORIET_HOST" --directory _site
