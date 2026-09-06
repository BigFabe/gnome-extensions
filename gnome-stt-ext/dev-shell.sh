#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

make lint
cp extension.js prefs.js metadata.json \
  "$HOME/.local/share/gnome-shell/extensions/push-to-talk-stt@local/"
cp helper/stt_helper.py \
  "$HOME/.local/share/gnome-shell/extensions/push-to-talk-stt@local/helper/"
cp schemas/org.gnome.shell.extensions.push-to-talk-stt.gschema.xml \
  "$HOME/.local/share/gnome-shell/extensions/push-to-talk-stt@local/schemas/"
glib-compile-schemas \
  "$HOME/.local/share/gnome-shell/extensions/push-to-talk-stt@local/schemas"

echo "Starte GNOME Shell Devkit. Fenster schließen oder Strg+C beendet den Test."
exec dbus-run-session -- gnome-shell --devkit --wayland
