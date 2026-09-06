import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const UUID = 'push-to-talk-stt@local';
const ACTIVE = 1;

export var METRICS = {};

export function init() {
}

export async function run() {
    await Scripting.sleep(4000);

    const extension = Main.extensionManager.lookup(UUID);
    if (!extension)
        throw new Error(`Extension ${UUID} was not loaded`);
    if (extension.state !== ACTIVE) {
        const errors = extension.errors?.map(error => error.message ?? `${error}`).join('\n') ?? '';
        throw new Error(`Extension state is ${extension.state}, expected ACTIVE. ${errors}`);
    }
    if (!Main.panel.statusArea[UUID])
        throw new Error('Panel indicator was not registered');

    const state = extension.stateObj;
    for (let i = 0; i < 20 && !state._ready; i++)
        await Scripting.sleep(500);
    if (!state._ready)
        throw new Error('STT helper did not become ready');

    state._onGlobalKeyPressed();
    if (!state._recording)
        throw new Error('Global push-to-talk shortcut did not start recording');

    state._endRecording();
    if (state._recording)
        throw new Error('Push-to-talk recording did not stop');
}

export function finish() {
}
