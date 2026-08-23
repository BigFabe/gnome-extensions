# macOS Switcher Shift for GNOME

A small GNOME Shell 50 extension for macOS-style switcher navigation.

Shortcuts refer to logical modifiers:

- `Super+Tab`: switch applications
- Keep `Super` held, then press `Shift`: move backward through applications
- While the switcher is open, `Super+Escape`: cycle through windows of the selected application
- Then press `Shift` while holding `Super`: move backward through those windows

## Installation

Copy `extension.js` and `metadata.json` to:

```text
~/.local/share/gnome-shell/extensions/macos-alt-tab-shift@local/
```

The required keybindings are:

```bash
gsettings set org.gnome.desktop.wm.keybindings switch-applications "['<Super>Tab']"
gsettings set org.gnome.desktop.wm.keybindings switch-applications-backward "['<Shift><Super>Tab']"
gsettings set org.gnome.desktop.wm.keybindings switch-group "['<Super>Escape', '<Super>Above_Tab', '<Alt>Above_Tab']"
gsettings set org.gnome.desktop.wm.keybindings switch-group-backward "['<Shift><Super>Escape', '<Shift><Super>Above_Tab', '<Shift><Alt>Above_Tab']"
gsettings set org.gnome.mutter.wayland.keybindings restore-shortcuts "['<Control><Super>Escape']"
gsettings set org.gnome.mutter.keybindings cancel-input-capture "['<Control><Shift><Super>Escape']"
```

Enable the extension and log out and back in:

```bash
gnome-extensions enable macos-alt-tab-shift@local
```
