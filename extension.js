import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import {
    Extension,
    InjectionManager,
} from 'resource:///org/gnome/shell/extensions/extension.js';

function isShiftKey(keysym) {
    return keysym === Clutter.KEY_Shift_L ||
        keysym === Clutter.KEY_Shift_R;
}

export default class MacOSAltTabShiftExtension extends Extension {
    enable() {
        this._injectionManager = new InjectionManager();
        this._injectionManager.overrideMethod(
            AltTab.AppSwitcherPopup.prototype,
            '_initialSelection',
            originalMethod => function (backward, binding) {
                if (binding === 'switch-applications' ||
                    binding === 'switch-applications-backward')
                    this._macOSShiftNavigation = 'applications';
                else if (binding === 'switch-group' ||
                    binding === 'switch-group-backward')
                    this._macOSShiftNavigation = 'group';
                else
                    this._macOSShiftNavigation = null;

                return originalMethod.call(this, backward, binding);
            });

        this._injectionManager.overrideMethod(
            AltTab.AppSwitcherPopup.prototype,
            '_keyPressHandler',
            originalMethod => function (keysym, action) {
                if (action === Meta.KeyBindingAction.SWITCH_GROUP ||
                    action === Meta.KeyBindingAction.SWITCH_GROUP_BACKWARD)
                    this._macOSShiftNavigation = 'group';
                else if (action === Meta.KeyBindingAction.SWITCH_APPLICATIONS ||
                    action === Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD)
                    this._macOSShiftNavigation = 'applications';

                if (isShiftKey(keysym)) {
                    if (this._macOSShiftNavigation === 'group') {
                        this._select(this._selectedIndex, this._previousWindow());
                        return Clutter.EVENT_STOP;
                    } else if (this._macOSShiftNavigation === 'applications') {
                        this._select(this._previous());
                        return Clutter.EVENT_STOP;
                    }
                }

                return originalMethod.call(this, keysym, action);
            });
    }

    disable() {
        this._injectionManager.clear();
        this._injectionManager = null;
    }
}
