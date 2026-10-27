// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class HotCorner {
    constructor(settings, open, activate) {
        this._settings = settings;
        this._open = open;
        this.actor = new St.Widget({
            name: 'music-companion-hot-corner',
            reactive: true,
            width: 12,
            height: 12,
        });
        Main.layoutManager.addTopChrome(this.actor, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this.actor.connect('enter-event', () => {
            this._schedule();
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('leave-event', () => {
            this._cancel();
            this._pressed = false;
            return Clutter.EVENT_PROPAGATE;
        });
        // A click before the dwell delay still completes the same one-click
        // action. Open on release so it cannot also click the newly shown button.
        this.actor.connect('button-press-event', (_actor, event) => {
            if (
                event.get_button() !== Clutter.BUTTON_PRIMARY ||
                Main.overview.visible ||
                Main.sessionMode.isLocked
            )
                return Clutter.EVENT_PROPAGATE;
            this._cancel();
            this._pressed = true;
            return Clutter.EVENT_STOP;
        });
        this.actor.connect('button-release-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY || !this._pressed)
                return Clutter.EVENT_PROPAGATE;
            this._pressed = false;
            if (!Main.overview.visible && !Main.sessionMode.isLocked) {
                this._open();
                activate();
            }
            return Clutter.EVENT_STOP;
        });
        this._cornersId = Main.layoutManager.connect(
            'hot-corners-changed',
            () => this._replaceCorner(),
        );
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () =>
            this._position(),
        );
        this._overviewId = Main.overview.connect('showing', () =>
            this._cancel(),
        );
        this._replaceCorner();
        this._position();
    }

    _replaceCorner() {
        const layout = Main.layoutManager;
        const corner = layout.hotCorners[layout.primaryIndex];
        // Do not touch the top-right corner in an RTL desktop.
        if (corner && corner._x === layout.primaryMonitor?.x) {
            corner.destroy();
            layout.hotCorners[layout.primaryIndex] = null;
        }
    }

    _position() {
        this._cancel();
        const monitor = Main.layoutManager.primaryMonitor;
        this.actor.visible = !!monitor;
        if (monitor) this.actor.set_position(monitor.x, monitor.y);
    }

    _schedule() {
        this._cancel();
        if (Main.overview.visible || Main.sessionMode.isLocked) return;
        this._timer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            this._settings.get_uint('open-delay'),
            () => {
                this._timer = 0;
                const [x, y] = global.get_pointer();
                const monitor = Main.layoutManager.primaryMonitor;
                if (
                    monitor &&
                    x >= monitor.x &&
                    x < monitor.x + 12 &&
                    y >= monitor.y &&
                    y < monitor.y + 12 &&
                    !Main.overview.visible &&
                    !Main.sessionMode.isLocked
                )
                    this._open();
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _cancel() {
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = 0;
    }

    destroy() {
        this._cancel();
        Main.layoutManager.disconnect(this._cornersId);
        Main.layoutManager.disconnect(this._monitorsId);
        Main.overview.disconnect(this._overviewId);
        this.actor.destroy();
        // Rebuild from GNOME's current preferences, without writing them.
        Main.layoutManager._updateHotCorners();
    }
}
