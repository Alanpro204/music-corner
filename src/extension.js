// SPDX-License-Identifier: GPL-2.0-or-later
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import { MprisClient } from './mpris/client.js';
import { PlayerCard } from './ui/playerCard.js';
import { HotCorner } from './triggers/hotCorner.js';

export default class MusicCompanion extends Extension {
    enable() {
        const settings = this.getSettings();
        this._settings = settings;
        this.client = new MprisClient();
        this.card = new PlayerCard(this.client, settings, () =>
            this.openPreferences(),
        );
        this.corner = new HotCorner(
            settings,
            () => this.card.open(),
            () => this.card.togglePlayback(),
        );
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, true);
        this._indicator.accessible_name = 'Abrir Music Corner';
        this._indicator.add_child(
            new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                style_class: 'system-status-icon',
            }),
        );
        this._indicator.connect('button-press-event', () => {
            this.card.toggle();
            return Clutter.EVENT_STOP;
        });
        this._indicator.connect('key-press-event', (_actor, event) => {
            if (
                [Clutter.KEY_Return, Clutter.KEY_space].includes(
                    event.get_key_symbol(),
                )
            ) {
                this.card.toggle();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.card.anchor = this._indicator;
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'left');
        this._panelVisibilityId = settings.connect(
            'changed::show-panel-icon',
            () =>
                (this._indicator.visible =
                    settings.get_boolean('show-panel-icon')),
        );
        this._indicator.visible = settings.get_boolean('show-panel-icon');
        Main.wm.addKeybinding(
            'toggle-music-companion',
            settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP,
            () => this.card.toggle(),
        );
        console.info(`[${this.uuid}] enabled`);
    }

    disable() {
        Main.wm.removeKeybinding('toggle-music-companion');
        if (this._panelVisibilityId) {
            this._settings.disconnect(this._panelVisibilityId);
            this._panelVisibilityId = 0;
        }
        this.corner?.destroy();
        this.corner = null;
        this.card?.destroy();
        this.card = null;
        this.client?.destroy();
        this.client = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
        console.info(`[${this.uuid}] disabled`);
    }
}
