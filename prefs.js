import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PushToTalkPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(620, 520);

        const page = new Adw.PreferencesPage({
            title: 'Push-to-Talk STT',
            icon_name: 'audio-input-microphone-symbolic',
        });
        window.add(page);

        const inputGroup = new Adw.PreferencesGroup({
            title: 'Bedienung',
            description: 'Die Taste wird global abgefangen, solange die Erweiterung aktiv ist.',
        });
        page.add(inputGroup);

        const keyRow = new Adw.EntryRow({
            title: 'Push-to-Talk-Taste',
            text: settings.get_string('activation-key'),
        });
        keyRow.add_suffix(new Gtk.ShortcutLabel({
            accelerator: settings.get_string('activation-key'),
            valign: Gtk.Align.CENTER,
        }));
        keyRow.connect('changed', () => {
            const value = keyRow.text.trim();
            if (value)
                settings.set_string('activation-key', value);
        });
        inputGroup.add(keyRow);

        const clipboardRow = new Adw.SwitchRow({
            title: 'Nur in die Zwischenablage kopieren',
            subtitle: 'Ausgeschaltet: Das fertige Transkript wird nach dem Loslassen automatisch ins fokussierte Textfeld eingefügt.',
        });
        settings.bind('clipboard-only', clipboardRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        inputGroup.add(clipboardRow);

        const spaceRow = new Adw.SwitchRow({
            title: 'Leerzeichen nach fertigen Phrasen',
        });
        settings.bind('trailing-space', spaceRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        inputGroup.add(spaceRow);

        const engineGroup = new Adw.PreferencesGroup({
            title: 'Spracherkennung',
            description: 'Die Erkennung läuft lokal mit Parakeet TDT v3; Audiodaten verlassen den Rechner nicht.',
        });
        page.add(engineGroup);

        const modelRow = new Adw.EntryRow({
            title: 'Parakeet-Modell-Datei',
            text: settings.get_string('model-path'),
            show_apply_button: true,
        });
        modelRow.connect('apply', () => settings.set_string('model-path', modelRow.text.trim()));
        engineGroup.add(modelRow);

        const sourceRow = new Adw.EntryRow({
            title: 'Audioquelle (optional)',
            text: settings.get_string('audio-source'),
            show_apply_button: true,
        });
        sourceRow.connect('apply', () => settings.set_string('audio-source', sourceRow.text.trim()));
        engineGroup.add(sourceRow);

        const helpGroup = new Adw.PreferencesGroup({title: 'Hinweise'});
        page.add(helpGroup);
        helpGroup.add(new Adw.ActionRow({
            title: 'Standard-Modellpfad',
            subtitle: '~/.local/share/gnome-stt/models/ggml-parakeet-tdt-0.6b-v3-q8_0.bin',
        }));
        helpGroup.add(new Adw.ActionRow({
            title: 'Beispiele für Tastennamen',
            subtitle: 'Hyper+A (Caps+A), Strg+Leertaste, Strg+Alt+Leertaste',
        }));
    }
}
