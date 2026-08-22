import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const Encoder = new TextEncoder();
const Decoder = new TextDecoder('utf-8');

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Push-to-Talk STT');
        this._extension = extension;

        this._icon = new St.Icon({
            icon_name: 'microphone-sensitivity-muted-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this._status = new PopupMenu.PopupMenuItem('STT wird gestartet …', {
            reactive: false,
        });
        this.menu.addMenuItem(this._status);

        this._toggle = new PopupMenu.PopupMenuItem('Aufnahme starten');
        this._toggle.connect('activate', () => this._extension.toggleRecording());
        this.menu.addMenuItem(this._toggle);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const preferences = new PopupMenu.PopupMenuItem('Einstellungen');
        preferences.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(preferences);
    }

    setState(state, detail = '') {
        const states = {
            loading: ['microphone-sensitivity-muted-symbolic', 'STT-Modell wird geladen …'],
            ready: ['microphone-sensitivity-high-symbolic', 'Bereit'],
            recording: ['media-record-symbolic', detail || 'Ich höre zu …'],
            processing: ['content-loading-symbolic', 'Transkription läuft …'],
            error: ['dialog-error-symbolic', detail || 'STT-Fehler'],
        };
        const [icon, label] = states[state] ?? states.error;
        this._icon.icon_name = icon;
        this._status.label.text = label;
        this._toggle.label.text = state === 'recording' ? 'Aufnahme stoppen' : 'Aufnahme starten';
    }
});

export default class PushToTalkExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._shuttingDown = false;
        this._recording = false;
        this._ready = false;
        this._transcriptParts = [];
        this._savedClipboard = null;
        this._restoreClipboardId = 0;
        this._modifierPollId = 0;
        this._keybindingInstalled = false;

        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._indicator.setState('loading');

        const seat = Clutter.get_default_backend().get_default_seat();
        this._virtualKeyboard = seat.create_virtual_device(
            Clutter.InputDeviceType.KEYBOARD_DEVICE);

        this._shutdownId = global.connect('shutdown', () => {
            this._shuttingDown = true;
            this._stopHelper();
        });

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'model-path') {
                this._restartHelper();
            } else if (key === 'activation-key') {
                this._installGlobalKeybinding();
            }
        });

        this._installGlobalKeybinding();
        this._startHelper();
    }

    disable() {
        this._shuttingDown = true;

        if (this._shutdownId)
            global.disconnect(this._shutdownId);
        this._shutdownId = 0;

        if (this._settingsChangedId)
            this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = 0;

        if (this._restoreClipboardId)
            GLib.source_remove(this._restoreClipboardId);
        if (this._modifierPollId)
            GLib.source_remove(this._modifierPollId);
        this._modifierPollId = 0;
        if (this._keybindingInstalled)
            Main.wm.removeKeybinding('ptt-keybinding');
        this._keybindingInstalled = false;
        this._restoreClipboard();
        this._stopHelper();
        this._indicator?.destroy();

        this._indicator = null;
        this._settings = null;
        this._virtualKeyboard = null;
    }

    toggleRecording() {
        if (this._recording)
            this._endRecording();
        else
            this._beginRecording();
    }

    _installGlobalKeybinding() {
        if (this._keybindingInstalled)
            Main.wm.removeKeybinding('ptt-keybinding');
        this._keybindingInstalled = false;
        const key = this._settings.get_string('activation-key');
        this._settings.set_strv('ptt-keybinding', [key]);
        Main.wm.addKeybinding(
            'ptt-keybinding',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL,
            () => this._onGlobalKeyPressed());
        this._keybindingInstalled = true;
    }

    _onGlobalKeyPressed() {
        const key = this._settings.get_string('activation-key');
        const modifierMask = this._modifierMaskForKey(key);

        if (!modifierMask) {
            this.toggleRecording();
            return;
        }

        this._beginRecording();
        if (this._modifierPollId)
            GLib.source_remove(this._modifierPollId);
        this._modifierPollId = GLib.timeout_add(GLib.PRIORITY_HIGH, 25, () => {
            const [, , modifiers] = global.get_pointer();
            if ((modifiers & modifierMask) !== 0)
                return GLib.SOURCE_CONTINUE;

            this._modifierPollId = 0;
            this._endRecording();
            return GLib.SOURCE_REMOVE;
        });
    }

    _modifierMaskForKey(key) {
        let mask = 0;
        if (key.includes('<Control>') || key === 'Control_L' || key === 'Control_R')
            mask |= Clutter.ModifierType.CONTROL_MASK;
        if (key.includes('<Shift>') || key === 'Shift_L' || key === 'Shift_R')
            mask |= Clutter.ModifierType.SHIFT_MASK;
        if (key.includes('<Alt>') || key === 'Alt_L' || key === 'Alt_R')
            mask |= Clutter.ModifierType.MOD1_MASK;
        if (key.includes('<Super>') || key === 'Super_L' || key === 'Super_R')
            mask |= Clutter.ModifierType.SUPER_MASK;
        if (key.includes('<Hyper>') || key.includes('<Mod3>') ||
            key === 'Hyper_L' || key === 'Hyper_R')
            mask |= Clutter.ModifierType.MOD3_MASK;
        return mask;
    }

    _beginRecording() {
        if (this._recording)
            return;
        if (!this._ready) {
            Main.notify('Push-to-Talk STT', 'Das Sprachmodell ist noch nicht bereit.');
            return;
        }

        this._recording = true;
        this._transcriptParts = [];
        if (!this._settings.get_boolean('clipboard-only'))
            this._saveClipboard();
        this._send({
            command: 'start',
            source: this._settings.get_string('audio-source'),
        });
        this._indicator.setState('recording');
    }

    _endRecording() {
        if (!this._recording)
            return;
        this._recording = false;
        this._send({command: 'stop'});
        this._indicator.setState(this._ready ? 'ready' : 'loading');
    }

    _startHelper() {
        const configuredPath = this._settings.get_string('model-path');
        const modelPath = configuredPath || GLib.build_filenamev([
            GLib.get_home_dir(), '.local', 'share', 'gnome-stt', 'models',
            'ggml-parakeet-tdt-0.6b-v3-q8_0.bin',
        ]);
        const cli = '/usr/bin/parakeet-cli';
        const helper = GLib.build_filenamev([this.path, 'helper', 'stt_helper.py']);

        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDIN_PIPE |
                    Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_MERGE,
            });
            launcher.setenv('PYTHONUNBUFFERED', '1', true);
            this._process = launcher.spawnv([
                'python3', helper, '--cli', cli, '--model', modelPath,
            ]);
            this._stdin = this._process.get_stdin_pipe();
            this._stdout = new Gio.DataInputStream({
                base_stream: this._process.get_stdout_pipe(),
            });
            this._readNextLine();
        } catch (error) {
            this._showError(error.message);
        }
    }

    _stopHelper() {
        if (!this._process)
            return;
        try {
            this._send({command: 'quit'});
            this._process.force_exit();
        } catch (_error) {
            // The helper may already have exited.
        }
        this._process = null;
        this._stdin = null;
        this._stdout = null;
        this._ready = false;
    }

    _restartHelper() {
        this._stopHelper();
        this._indicator.setState('loading');
        this._startHelper();
    }

    _send(message) {
        if (!this._stdin)
            return;
        try {
            this._stdin.write_all(Encoder.encode(`${JSON.stringify(message)}\n`), null);
            this._stdin.flush(null);
        } catch (error) {
            this._showError(error.message);
        }
    }

    _readNextLine() {
        const stream = this._stdout;
        if (!stream)
            return;
        stream.read_line_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
            if (source !== this._stdout)
                return;
            try {
                const [line] = source.read_line_finish(result);
                if (!line) {
                    this._showError('Der STT-Helfer wurde beendet.');
                    return;
                }
                const text = Decoder.decode(line);
                try {
                    this._handleHelperMessage(JSON.parse(text));
                } catch (_error) {
                    console.warn(`[Push-to-Talk STT] helper: ${text}`);
                }
                this._readNextLine();
            } catch (error) {
                this._showError(error.message);
            }
        });
    }

    _handleHelperMessage(message) {
        if (this._shuttingDown)
            return;

        switch (message.type) {
        case 'ready':
            this._ready = true;
            this._indicator.setState('ready');
            break;
        case 'recording':
            this._indicator.setState('recording');
            break;
        case 'processing':
            this._indicator.setState('processing');
            break;
        case 'final':
            if (this._settings.get_boolean('clipboard-only'))
                this._appendTranscript(message.text ?? '');
            else
                this._commitFinal(message.text ?? '');
            break;
        case 'stopped': {
            if (!this._recording)
                this._indicator.setState('ready');
            if (this._settings.get_boolean('clipboard-only')) {
                this._copyTranscript();
            } else {
                this._scheduleClipboardRestore();
            }
            break;
        }
        case 'error':
            this._showError(message.message || 'Unbekannter STT-Fehler', false);
            break;
        }
    }

    _appendTranscript(text) {
        text = text.trim();
        if (text)
            this._transcriptParts.push(text);
        this._copyTranscript();
    }

    _copyTranscript() {
        const transcript = this._transcriptParts.join(' ').trim();
        if (transcript)
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, transcript);
        return transcript;
    }

    _commitFinal(text) {
        text = text.trim();
        if (!text)
            return;
        if (this._settings.get_boolean('trailing-space'))
            text += ' ';
        this._paste(text);
    }

    _paste(text) {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
        const time = GLib.get_monotonic_time();
        this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
        this._virtualKeyboard.notify_keyval(time, Clutter.KEY_v, Clutter.KeyState.PRESSED);
        this._virtualKeyboard.notify_keyval(time, Clutter.KEY_v, Clutter.KeyState.RELEASED);
        this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
    }

    _saveClipboard() {
        this._savedClipboard = null;
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
            this._savedClipboard = text;
        });
    }

    _scheduleClipboardRestore() {
        if (this._restoreClipboardId)
            GLib.source_remove(this._restoreClipboardId);
        this._restoreClipboardId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._restoreClipboardId = 0;
            this._restoreClipboard();
            return GLib.SOURCE_REMOVE;
        });
    }

    _restoreClipboard() {
        if (this._savedClipboard !== null) {
            St.Clipboard.get_default().set_text(
                St.ClipboardType.CLIPBOARD, this._savedClipboard);
            this._savedClipboard = null;
        }
    }

    _showError(message, fatal = true) {
        if (this._shuttingDown)
            return;

        console.error(`[Push-to-Talk STT] ${message}`);
        if (fatal)
            this._ready = false;
        this._recording = false;
        this._indicator?.setState('error', message);
        Main.notify('Push-to-Talk STT', message);
    }
}
