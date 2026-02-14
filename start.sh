#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ "$ROOT_DIR" == *"/.git-sync/"* ]]; then
  echo "[ERROR] Do not run from .git-sync mirror:"
  echo "        $ROOT_DIR"
  echo "[HINT] Use the real repo path instead:"
  echo "       /Users/mac/Downloads/code/ai_travel_program_fixed/ai_travel_program"
  exit 1
fi

if command -v git >/dev/null 2>&1; then
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  CURRENT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "[AI-Travel] Branch: $CURRENT_BRANCH ($CURRENT_COMMIT)"
fi

echo "[AI-Travel] Starting backend + admin..."

cd ai-travel-photo-app

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    echo "[AI-Travel] pnpm not found. Installing via corepack..."
    corepack enable
    corepack prepare pnpm@10.4.1 --activate
  else
    echo "[ERROR] pnpm not found and corepack is unavailable. Please install pnpm first."
    exit 1
  fi
fi

node scripts/init-env.mjs

pnpm install
pnpm run db:push
pnpm run dev
