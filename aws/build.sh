#!/bin/sh
# Assembles the Lambda deployment directory (aws/.build/) from the handler
# plus a verbatim copy of the SHARED refresh core, so the scheduled run and
# scripts/refresh-wise-rows.mjs execute literally the same guard code.
# `sam build`/`sam deploy` and the local tests all use this output.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/aws/.build"

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$ROOT/aws/refresh-lambda/handler.mjs" "$OUT/handler.mjs"
cp "$ROOT/scripts/lib/refresh-core.mjs" "$OUT/refresh-core.mjs"

# No npm dependencies: the AWS SDK v3 used for Secrets Manager ships inside
# the Lambda Node runtime. The manifest just marks the .mjs files as ESM.
printf '{ "name": "corridor-rate-refresh", "version": "1.0.0", "private": true, "type": "module" }\n' > "$OUT/package.json"

# The copy must be byte-identical to the source of truth.
cmp "$ROOT/scripts/lib/refresh-core.mjs" "$OUT/refresh-core.mjs"
echo "built $OUT (handler.mjs + refresh-core.mjs + package.json; core identical to scripts/lib)"
