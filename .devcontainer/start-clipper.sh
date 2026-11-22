#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(git rev-parse --show-toplevel)"
DATA_DIR="$REPO_DIR/clipper-engine/data"
TOKEN_FILE="$DATA_DIR/api-token"
mkdir -p "$DATA_DIR"
if [[ ! -s "$TOKEN_FILE" ]]; then
  openssl rand -hex 32 > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
fi

cd "$REPO_DIR/clipper-engine"
export CLIPPER_CODESPACES=1
export CLIPPER_SERVE_STUDIO=1
export CLIPPER_DATA_DIR="$DATA_DIR"
export CLIPPER_API_TOKEN="$(cat "$TOKEN_FILE")"
export CLIPPER_ALLOWED_ORIGINS="https://kibruder.github.io"
export CLIPPER_MAX_UPLOAD_BYTES=1073741824
export CLIPPER_HOST=0.0.0.0
export PORT=8765

nohup .venv/bin/uvicorn main:app --host "$CLIPPER_HOST" --port "$PORT" --workers 1 \
  > "$DATA_DIR/engine.log" 2>&1 < /dev/null &
