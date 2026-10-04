#!/usr/bin/env bash
# Start the FastAPI backend and Next.js frontend concurrently.
# Usage (from repo root, with your conda env active):
#   ./dev.sh
#
# Optional env vars:
#   BACKEND_PORT   uvicorn port  (default: 8000)
#   FRONTEND_PORT  Next.js port  (default: 3000)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# ANSI colour codes — $'...' syntax works on bash 3.2+ (macOS default)
RESET=$'\033[0m'
BOLD=$'\033[1m'
CYAN=$'\033[36m'
MAGENTA=$'\033[35m'
RED=$'\033[31m'
YELLOW=$'\033[33m'

log()  { printf "%s[dev]%s %s\n"     "$BOLD"    "$RESET" "$*"; }
err()  { printf "%s%s[dev] ERROR:%s %s\n" "$RED" "$BOLD" "$RESET" "$*" >&2; }

BACKEND_TAG="${CYAN}${BOLD}[backend]${RESET}"
FRONTEND_TAG="${MAGENTA}${BOLD}[frontend]${RESET}"
DATA_TAG="${YELLOW}${BOLD}[data]${RESET}"

prefix_pipe() {
  local tag="$1"
  while IFS= read -r line; do
    printf "%s %s\n" "$tag" "$line"
  done
}

# ── helpers ──────────────────────────────────────────────────────────────────

# Kill any process currently listening on a TCP port (macOS + Linux).
free_port() {
  local port="$1"
  local pids
  local remaining
  local attempt
  pids=$(lsof -ti tcp:"$port" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    log "Port $port in use (pid $pids) — killing…"
    echo "$pids" | xargs kill 2>/dev/null || true
    for attempt in {1..50}; do
      remaining=$(lsof -ti tcp:"$port" 2>/dev/null) || true
      [ -z "$remaining" ] && return 0
      sleep 0.1
    done
    err "Port $port is still in use after waiting for pid $remaining to stop."
    return 1
  fi
}

# ── retrieval index check ────────────────────────────────────────────────────

INDEX_FILE="$REPO_ROOT/backend/data/indices/idea_overview.faiss"
STRUCTURE_INDEX_FILE="$REPO_ROOT/backend/data/indices/structure_overview.faiss"
STYLE_INDEX_FILE="$REPO_ROOT/backend/data/indices/style_overview.faiss"
HASH_FILE="$REPO_ROOT/backend/data/indices/metadata.hash"
METADATA_FILE="$REPO_ROOT/frontend/datasets/records.json"
DOWNLOAD_SCRIPT="$REPO_ROOT/download_data.py"

_metadata_hash() {
  PYTHONPATH="$REPO_ROOT/backend" python -c "import sys; from pathlib import Path; from app.retrieval.index_metadata import index_fingerprint; print(index_fingerprint(Path(sys.argv[1])))" \
    "$METADATA_FILE" 2>/dev/null
}

check_and_build_index() {
  local reason=""

  if [ ! -f "$METADATA_FILE" ]; then
    printf "%s%s[index]%s records.json not found; skipping index check until dataset is available.\n" \
      "$YELLOW" "$BOLD" "$RESET"
    return 0
  fi

  if [ ! -f "$INDEX_FILE" ] || [ ! -f "$STRUCTURE_INDEX_FILE" ] || [ ! -f "$STYLE_INDEX_FILE" ]; then
    reason="missing"
  else
    local current_hash stored_hash
    current_hash=$(_metadata_hash)
    stored_hash=$(cat "$HASH_FILE" 2>/dev/null || echo "")
    if [ -n "$current_hash" ] && [ "$current_hash" != "$stored_hash" ]; then
      reason="stale"
    fi
  fi

  [ -z "$reason" ] && return 0   # index exists and is up to date

  echo ""
  if [ "$reason" = "missing" ]; then
    printf "%s%s[index]%s Primary retrieval indexes not found — search will use a slower keyword fallback.\n" \
      "$YELLOW" "$BOLD" "$RESET"
    printf "%s%s[index]%s Build now? [Y/n] " "$YELLOW" "$BOLD" "$RESET"
    local default="Y"
  else
    printf "%s%s[index]%s records.json or embedding settings changed — retrieval index is stale.\n" \
      "$YELLOW" "$BOLD" "$RESET"
    printf "%s%s[index]%s Rebuild now? [Y/n] " "$YELLOW" "$BOLD" "$RESET"
    local default="Y"
  fi

  local answer
  read -r answer </dev/tty
  answer="${answer:-$default}"

  if [[ "$answer" =~ ^[Yy] ]]; then
    printf "%s%s[index]%s Building Idea, Layout, and Style retrieval indexes with jina-embeddings-v3…\n" "$CYAN" "$BOLD" "$RESET"
    if python "$REPO_ROOT/backend/scripts/build_index.py"; then
      printf "%s%s[index]%s Index built successfully.\n" "$CYAN" "$BOLD" "$RESET"
    else
      printf "%s%s[index] WARNING:%s Build failed — searches will return errors.\n" \
        "$RED" "$BOLD" "$RESET"
    fi
  else
    if [ "$reason" = "missing" ]; then
      printf "%s%s[index]%s Skipping build. Searches will return errors until the index is built.\n" \
        "$YELLOW" "$BOLD" "$RESET"
    fi
  fi
  echo ""
}

check_and_update_data() {
  [ ! -f "$DOWNLOAD_SCRIPT" ] && return 0

  if [ -z "${HIFIGURE_DATA_REPO:-}" ]; then
    if [ ! -f "$METADATA_FILE" ]; then
      printf "%s Supply frontend/datasets/records.json and images/ for retrieval, or set HIFIGURE_DATA_REPO to your dataset release repository.\n" "$DATA_TAG"
    fi
    return 0
  fi

  echo ""
  local answer default prompt
  if [ ! -f "$METADATA_FILE" ]; then
    printf "%s Dataset not found at %s.\n" "$DATA_TAG" "$METADATA_FILE"
    prompt="Download now?"
    default="Y"
  else
    printf "%s Dataset found at %s.\n" "$DATA_TAG" "$METADATA_FILE"
    prompt="Check for updates?"
    default="Y"
  fi

  printf "%s %s [%s] " "$DATA_TAG" "$prompt" "$( [ "$default" = "Y" ] && printf "Y/n" || printf "y/N" )"
  read -r answer </dev/tty
  answer="${answer:-$default}"

  if [[ "$answer" =~ ^[Yy] ]]; then
    if ! command -v python &>/dev/null; then
      printf "%s%s[data] WARNING:%s python not found. Activate your conda/venv environment to download data.\n" \
        "$RED" "$BOLD" "$RESET"
      echo ""
      return 0
    fi

    printf "%s Downloading/updating dataset...\n" "$DATA_TAG"
    if python "$DOWNLOAD_SCRIPT"; then
      printf "%s Dataset is ready.\n" "$DATA_TAG"
    else
      printf "%s%s[data] WARNING:%s Dataset download/update failed. Continuing with local files if available.\n" \
        "$RED" "$BOLD" "$RESET"
    fi
  fi
  echo ""
}

check_and_update_data
check_and_build_index

# ── dependency checks ────────────────────────────────────────────────────────

if ! command -v uvicorn &>/dev/null; then
  err "uvicorn not found. Activate your conda/venv environment first."
  exit 1
fi

if ! command -v npm &>/dev/null; then
  err "npm not found. Activate your conda/venv environment first."
  exit 1
fi

FRONTEND_DIR="$REPO_ROOT/frontend"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  log "node_modules missing — running npm install…"
  npm install --prefix "$FRONTEND_DIR"
fi

# ── process management ───────────────────────────────────────────────────────

BACKEND_PID=""
FRONTEND_PID=""
BACKEND_LOG_PID=""
FRONTEND_LOG_PID=""
DEV_LOG_DIR=$(mktemp -d "${TMPDIR:-/tmp}/hichart-dev.XXXXXX") || {
  err "Could not create temporary log directory."
  exit 1
}
BACKEND_LOG_PIPE="$DEV_LOG_DIR/backend.pipe"
FRONTEND_LOG_PIPE="$DEV_LOG_DIR/frontend.pipe"
mkfifo "$BACKEND_LOG_PIPE" "$FRONTEND_LOG_PIPE"

stop_process_tree() {
  local pid="$1"
  local child
  local children=""

  [ -z "$pid" ] && return 0
  if command -v pgrep &>/dev/null; then
    children=$(pgrep -P "$pid" 2>/dev/null) || true
    for child in $children; do
      [ -n "$child" ] && stop_process_tree "$child"
    done
  fi
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  echo ""
  log "Shutting down…"
  stop_process_tree "$BACKEND_PID"
  stop_process_tree "$FRONTEND_PID"
  [ -n "$BACKEND_PID" ]  && wait "$BACKEND_PID"  2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && wait "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$BACKEND_LOG_PID" ]  && wait "$BACKEND_LOG_PID"  2>/dev/null || true
  [ -n "$FRONTEND_LOG_PID" ] && wait "$FRONTEND_LOG_PID" 2>/dev/null || true
  rm -f "$BACKEND_LOG_PIPE" "$FRONTEND_LOG_PIPE"
  rmdir "$DEV_LOG_DIR" 2>/dev/null || true
  log "Done."
}
trap cleanup INT TERM EXIT

# ── launch backend ───────────────────────────────────────────────────────────

free_port "$BACKEND_PORT" || exit 1
log "Starting ${CYAN}${BOLD}backend${RESET}  → http://127.0.0.1:${BACKEND_PORT}"
prefix_pipe "$BACKEND_TAG" < "$BACKEND_LOG_PIPE" &
BACKEND_LOG_PID=$!
(
  cd "$REPO_ROOT/backend"
  exec uvicorn app.main:app --reload --port "$BACKEND_PORT"
) > "$BACKEND_LOG_PIPE" 2>&1 &
BACKEND_PID=$!

sleep 1  # brief pause so the backend port is open before Next.js starts

# ── launch frontend ──────────────────────────────────────────────────────────

free_port "$FRONTEND_PORT" || exit 1
log "Starting ${MAGENTA}${BOLD}frontend${RESET} → http://localhost:${FRONTEND_PORT}"
prefix_pipe "$FRONTEND_TAG" < "$FRONTEND_LOG_PIPE" &
FRONTEND_LOG_PID=$!
(
  cd "$FRONTEND_DIR"
  export PORT="$FRONTEND_PORT"
  exec npm run dev
) > "$FRONTEND_LOG_PIPE" 2>&1 &
FRONTEND_PID=$!

# ── wait ─────────────────────────────────────────────────────────────────────

log "Press ${YELLOW}Ctrl+C${RESET} to stop both services."
echo ""

# Poll until either child exits (compatible with bash 3.2 on macOS).
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
