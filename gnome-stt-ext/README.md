# Push-to-Talk STT für GNOME

Lokale Spracheingabe für GNOME Shell unter Wayland:

- **Caps Lock + A halten** startet die Aufnahme
- **Caps Lock loslassen** beendet die Aufnahme
- Ein kurzer Systemton bestätigt den Aufnahmestart
- Parakeet TDT 0.6B v3 transkribiert lokal per CPU oder CUDA
- Das Ergebnis wird automatisch ins fokussierte Textfeld eingefügt oder optional nur in die Zwischenablage kopiert
- Keine Audiodaten verlassen den Rechner

Unterstützte GNOME-Shell-Versionen: 48–51.

## Voraussetzungen unter Arch Linux

```bash
sudo pacman -S whisper-cpp ggml-cpu pulseaudio-utils
# Optional für NVIDIA-Beschleunigung:
sudo pacman -S ggml-cuda
```

`ggml-cpu` wird auch mit CUDA als Fallback benötigt. Die Extension kompiliert keine native Laufzeit selbst.

## Installation

```bash
git clone https://github.com/BigFabe/gnome-extensions.git
cd gnome-extensions/gnome-stt-ext
chmod +x install.sh
./install.sh
```

Das Installationsskript:

1. prüft `parakeet-cli` und die GGML-Backends,
2. lädt das mehrsprachige Parakeet-Q8-Modell (ca. 640 MB),
3. installiert die Extension nach `~/.local/share/gnome-shell/extensions/`,
4. konfiguriert Caps Lock als Hyper-Modifikator.

Unter Wayland muss GNOME Shell nach der ersten Installation einmal neu gestartet werden, üblicherweise durch Ab- und Anmelden. Danach:

```bash
gnome-extensions enable push-to-talk-stt@local
```

## Verwendung

1. Caps Lock halten und `A` drücken.
2. Sprechen, während Caps Lock gehalten wird.
3. Caps Lock loslassen.
4. Kurz auf „Transkription läuft …“ warten.

Standardmäßig wird das fertige Transkript automatisch ins zuvor fokussierte Textfeld eingefügt. In den Einstellungen kann stattdessen der reine Zwischenablage-Modus aktiviert werden.

## Einstellungen

- Push-to-Talk-Kombination, intern standardmäßig `<Mod3>a` (Caps Lock + A)
- automatische Texteingabe oder nur Zwischenablage
- optionales Leerzeichen nach dem eingefügten Text
- eigene Parakeet-GGUF-Modelldatei
- festes PulseAudio-/PipeWire-Eingabegerät, damit ein Wechsel des GNOME-Standardgeräts die Aufnahmequelle nicht verändert

## Rechte Strg-Taste mit `keyd` verwenden

GNOME/Mutter kann eine einzelne Modifikatortaste wie `Control_R` nicht zuverlässig als globales Tastenkürzel mit Press- und Release-Erkennung registrieren. Als Workaround kann `keyd` die rechte Strg-Taste während des Haltens auf eine unbenutzte Tastenkombination abbilden.

Unter Arch Linux:

```bash
sudo pacman -S keyd
sudo mkdir -p /etc/keyd
sudo tee /etc/keyd/gnome-stt.conf >/dev/null <<'EOF'
[ids]
*

[main]
rightcontrol = layerm(gnome-stt, C-A-f12)

[gnome-stt:C-A]
EOF
sudo keyd check /etc/keyd/gnome-stt.conf
sudo systemctl enable --now keyd
sudo keyd reload
```

Anschließend in den Extension-Einstellungen `<Control><Alt>F12` als Push-to-Talk-Kombination eintragen. Je nach XKB-Konfiguration kann der von `keyd` erzeugte Alt-Modifikator als Super/Mod4 ankommen. Das lässt sich mit `wev` prüfen; in diesem Fall stattdessen `<Control><Super>F12` verwenden.

Die rechte Strg-Taste ist mit dieser Konfiguration nicht mehr als normale Strg-Taste verfügbar. Die `keyd`-Notfallkombination `Backspace+Escape+Enter` beendet den Daemon bei einer fehlerhaften Tastaturbelegung.

## Funktionsweise

Caps Lock wird über die XKB-Option `caps:hyper` als Hyper-Taste beziehungsweise Mod3 verwendet. Mutter registriert `<Mod3>a` als globales Tastenkürzel. Während Mod3 gehalten wird, zeichnet `parec` 16-kHz-Mono-Audio auf. Nach dem Loslassen transkribiert `/usr/bin/parakeet-cli` die gesamte Aufnahme, damit der vollständige Satzkontext erhalten bleibt.

Für die automatische Eingabe legt die Extension das Ergebnis kurz in die Zwischenablage und simuliert `Strg+V` über eine virtuelle GNOME-Shell-Tastatur. Anschließend wird der vorherige Klartext-Inhalt der Zwischenablage wiederhergestellt. Temporäre Audiodateien werden gelöscht.

## Entwicklung und Tests

Interaktive Wegwerf-Shell:

```bash
./dev-shell.sh
```

Automatischer Headless-Smoke-Test:

```bash
./dev-test.sh
```

Paket erstellen:

```bash
make pack
```

## Fehlerdiagnose

```bash
journalctl --user -f -o cat | grep -i 'Push-to-Talk STT'
```

Backend separat starten:

```bash
python3 ~/.local/share/gnome-shell/extensions/push-to-talk-stt@local/helper/stt_helper.py \
  --cli /usr/bin/parakeet-cli \
  --model ~/.local/share/gnome-stt/models/ggml-parakeet-tdt-0.6b-v3-q8_0.bin
```

Es sollte eine JSON-Zeile mit `"type": "ready"` erscheinen.
