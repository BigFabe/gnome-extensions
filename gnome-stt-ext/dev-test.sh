#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

make lint
make pack

echo "Starte eine wegwerfbare GNOME Shell für den Extension-Smoke-Test …"
dbus-run-session -- gnome-shell-test-tool \
  --headless \
  --disable-animations \
  --extension "$ROOT/push-to-talk-stt@local.shell-extension.zip" \
  "$ROOT/tests/smoke.js"

echo "Smoke-Test erfolgreich."
