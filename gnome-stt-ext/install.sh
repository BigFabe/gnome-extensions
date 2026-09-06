#!/usr/bin/env bash
set -euo pipefail

UUID="push-to-talk-stt@local"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
EXT_DIR="$DATA_DIR/gnome-shell/extensions/$UUID"
STT_DIR="$DATA_DIR/gnome-stt"
MODEL_DIR="$STT_DIR/models"
MODEL_NAME="ggml-parakeet-tdt-0.6b-v3-q8_0.bin"
MODEL_URL="https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/$MODEL_NAME"

echo "[1/4] Systemabhängigkeiten prüfen …"
if [[ ! -x /usr/bin/parakeet-cli ]]; then
  echo "parakeet-cli fehlt." >&2
  echo "Unter Arch installieren mit: sudo pacman -S whisper-cpp ggml-cpu" >&2
  exit 2
fi
if ! compgen -G '/usr/lib/ggml/libggml-cpu-*.so' >/dev/null; then
  echo "Das GGML-CPU-Backend fehlt. Es wird auch als CUDA-Fallback benötigt." >&2
  echo "Installieren mit: sudo pacman -S ggml-cpu" >&2
  exit 2
fi
if [[ -e /dev/nvidia0 ]] && [[ ! -f /usr/lib/ggml/libggml-cuda.so ]]; then
  echo "Hinweis: Für NVIDIA-Beschleunigung: sudo pacman -S ggml-cuda"
fi

echo "[2/4] Parakeet TDT v3 Q8-Modell installieren …"
mkdir -p "$MODEL_DIR"
if [[ ! -f "$MODEL_DIR/$MODEL_NAME" ]]; then
  curl --fail --location --progress-bar "$MODEL_URL" --output "$MODEL_DIR/$MODEL_NAME"
fi

echo "[3/4] GNOME-Erweiterung installieren …"
rm -rf "$EXT_DIR"
mkdir -p "$EXT_DIR"
cp "$ROOT/metadata.json" "$ROOT/extension.js" "$ROOT/prefs.js" "$EXT_DIR/"
cp -r "$ROOT/helper" "$ROOT/schemas" "$EXT_DIR/"
chmod +x "$EXT_DIR/helper/stt_helper.py"
glib-compile-schemas "$EXT_DIR/schemas"

echo "[4/4] Caps Lock als Hyper/Mod3 konfigurieren …"
python3 - <<'PY'
import ast
import subprocess

schema = 'org.gnome.desktop.input-sources'
key = 'xkb-options'
raw = subprocess.check_output(['gsettings', 'get', schema, key], text=True).strip()
options = ast.literal_eval(raw)
options = [option for option in options if not option.startswith('caps:')]
options.append('caps:hyper')
value = '[' + ', '.join(repr(option) for option in options) + ']'
subprocess.run(['gsettings', 'set', schema, key, value], check=True)
PY

echo
echo "Fertig. Standard: Caps Lock (Hyper) + A halten, sprechen und Caps loslassen."
echo "CUDA wird automatisch verwendet, wenn das Paket ggml-cuda installiert ist."
