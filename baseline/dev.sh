#!/usr/bin/env bash
set -euo pipefail

BASELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASELINE_PORT="${BASELINE_PORT:-3100}"

cd "$BASELINE_DIR"
printf "Baseline keyword search: http://127.0.0.1:%s\n" "$BASELINE_PORT"
printf "HiFigure remains on its separate port (normally http://127.0.0.1:3000).\n"
exec python3 -m http.server "$BASELINE_PORT" --bind 127.0.0.1

