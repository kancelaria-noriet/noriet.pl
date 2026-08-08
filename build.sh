#!/bin/bash
cd "$(dirname "$0")"
eval "$("$HOME/.local/share/fnm/fnm" env)"
exec npx @11ty/eleventy
