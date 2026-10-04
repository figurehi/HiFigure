#!/usr/bin/env bash
# Build (or rebuild) the FAISS retrieval indices from frontend/datasets/records.json.
# Usage (from repo root, with your conda env active):
#   ./build_index.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RESET=$'\033[0m'
BOLD=$'\033[1m'
CYAN=$'\033[36m'
YELLOW=$'\033[33m'
RED=$'\033[31m'
GREEN=$'\033[32m'

log()  { printf "%s[index]%s %s\n" "$BOLD"           "$RESET" "$*"; }
ok()   { printf "%s%s[index]%s %s\n" "$GREEN" "$BOLD" "$RESET" "$*"; }
warn() { printf "%s%s[index]%s %s\n" "$YELLOW" "$BOLD" "$RESET" "$*"; }
err()  { printf "%s%s[index] ERROR:%s %s\n" "$RED" "$BOLD" "$RESET" "$*" >&2; }

INDEX_DIR="$REPO_ROOT/backend/data/indices"
INDEX_FILE="$INDEX_DIR/idea_overview.faiss"
IDS_FILE="$INDEX_DIR/idea_overview.ids.json"
STRUCTURE_INDEX_FILE="$INDEX_DIR/structure_overview.faiss"
STRUCTURE_IDS_FILE="$INDEX_DIR/structure_overview.ids.json"
STYLE_INDEX_FILE="$INDEX_DIR/style_overview.faiss"
STYLE_IDS_FILE="$INDEX_DIR/style_overview.ids.json"
HASH_FILE="$INDEX_DIR/metadata.hash"
METADATA_FILE="$REPO_ROOT/frontend/datasets/records.json"
BUILD_SCRIPT="$REPO_ROOT/backend/scripts/build_index.py"

# ── pre-flight checks ────────────────────────────────────────────────────────

if ! command -v python &>/dev/null; then
  err "python not found. Activate your conda environment first."
  exit 1
fi

if [ ! -f "$METADATA_FILE" ]; then
  err "Metadata file not found: $METADATA_FILE"
  err "Place your FigureBench records.json in frontend/datasets/ first."
  exit 1
fi

RECORD_COUNT=$(python -c "import json; d=json.load(open('$METADATA_FILE')); print(len(d) if isinstance(d,dict) else len(d))" 2>/dev/null || echo "?")
log "Metadata: $METADATA_FILE ($RECORD_COUNT records)"

# ── check existing index ─────────────────────────────────────────────────────

if [ -f "$INDEX_FILE" ] && [ -f "$IDS_FILE" ] \
  && [ -f "$STRUCTURE_INDEX_FILE" ] && [ -f "$STRUCTURE_IDS_FILE" ] \
  && [ -f "$STYLE_INDEX_FILE" ] && [ -f "$STYLE_IDS_FILE" ]; then
  INDEX_DATE=$(date -r "$INDEX_FILE" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || stat -c "%y" "$INDEX_FILE" 2>/dev/null | cut -d. -f1)
  STORED_COUNT=$(python -c "import json; print(len(json.load(open('$IDS_FILE'))))" 2>/dev/null || echo "?")

  CURRENT_HASH=$(PYTHONPATH="$REPO_ROOT/backend" python -c "import sys; from pathlib import Path; from app.retrieval.index_metadata import index_fingerprint; print(index_fingerprint(Path(sys.argv[1])))" \
    "$METADATA_FILE" 2>/dev/null || echo "")
  STORED_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

  echo ""
  warn "An existing index was found:"
  warn "  File : $INDEX_FILE"
  warn "  Built: $INDEX_DATE"
  warn "  IDs  : $STORED_COUNT stored vectors"

  if [ -n "$CURRENT_HASH" ] && [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
    warn "  Note : records.json or embedding settings changed since the last build — index is stale."
  else
    warn "  Note : records.json matches the stored hash — index is up to date."
  fi

  echo ""
  printf "%s%s[index]%s Rebuild? This will overwrite the existing index. [y/N] " \
    "$YELLOW" "$BOLD" "$RESET"
  read -r answer
  answer="${answer:-N}"

  if [[ ! "$answer" =~ ^[Yy] ]]; then
    log "Rebuild cancelled. Existing index kept."
    exit 0
  fi
  echo ""
fi

# ── build ────────────────────────────────────────────────────────────────────

log "Building the Idea, Layout, and Style retrieval indices from $RECORD_COUNT records…"
log "(jina-embeddings-v3 will be downloaded on first run; stored as 256-dim vectors)"
echo ""

if python "$BUILD_SCRIPT"; then
  echo ""
  ok "Indices built successfully."
  ok "  $INDEX_DIR"
else
  echo ""
  err "Build failed. Check the output above."
  exit 1
fi
