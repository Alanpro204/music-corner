// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { trackKey } from '../mpris/constants.js';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';

function timestamp(microseconds) {
    const seconds = Math.floor(Math.max(0, microseconds) / 1000000);
    const minutes = Math.floor(seconds / 60);
    const rest = String(seconds % 60).padStart(2, '0');
    return minutes < 60
        ? `${minutes}:${rest}`
        : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}`;
}

export class Progress {
    constructor(client) {
        this._client = client;
        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: 'mc-progress',
        });
        this.slider = new Slider(0);
        this.slider.add_style_class_name('mc-seek');
        this.slider.accessible_name = 'Posición de la canción';
        this.actor.add_child(this.slider);
        const times = new St.BoxLayout();
        this.elapsed = new St.Label({
            text: '0:00',
            x_expand: true,
            style_class: 'mc-time',
        });
        this.duration = new St.Label({
            text: '—:—',
            x_align: Clutter.ActorAlign.END,
            style_class: 'mc-time',
        });
        times.add_child(this.elapsed);
        times.add_child(this.duration);
        this.actor.add_child(times);
        this.slider.connect('drag-begin', () => {
            this._cancelPending();
            this.dragging = true;
            this._target = this._client.snapshot.selected;
        });
        this.slider.connect('drag-end', () => {
            this.dragging = false;
            this._commit();
        });
        this.slider.connect('notify::value', () => {
            if (this._updating || !this.slider.reactive) return;
            if (this.dragging && !this._target) return;
            this._target ??= this._client.snapshot.selected;
            this._showTime(
                this.slider.value * (this._target?.duration ?? 0),
                this._target?.duration ?? 0,
            );
            if (this.dragging) return;
            this._cancelPending();
            // Coalesce repeated arrow keys and scroll events into one MPRIS request.
            this._pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                this._pending = 0;
                this._commit();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    _showTime(position, duration) {
        this.elapsed.text = timestamp(
            duration > 0 ? Math.min(position, duration) : position,
        );
        this.duration.text = duration > 0 ? timestamp(duration) : '—:—';
        this.slider.accessible_name = `Posición de la canción: ${this.elapsed.text} de ${this.duration.text}`;
    }

    render(selected = this._client.snapshot.selected) {
        if (this._target && trackKey(selected) !== trackKey(this._target)) {
            this._target = null;
            this._cancelPending();
        }
        const duration = selected?.duration ?? 0;
        const enabled = !!(
            selected?.canControl &&
            selected.canSeek &&
            duration > 0 &&
            selected.trackId !== '/org/mpris/MediaPlayer2/TrackList/NoTrack'
        );
        this.canSeek = enabled;
        this.slider.reactive = enabled && !this._busy;
        this.slider.can_focus = this.slider.reactive;
        this.slider.opacity = enabled ? 255 : 100;
        if ((this.dragging || this._pending || this._busy) && this._target)
            return;
        this._updating = true;
        this.slider.value =
            duration > 0
                ? Math.min(1, (selected?.position ?? 0) / duration)
                : 0;
        this._updating = false;
        this._showTime(selected?.position ?? 0, duration);
    }

    async skip(seconds) {
        if (this.dragging || this._busy || !this.slider.reactive) return;
        const target = this._client.snapshot.selected;
        if (!target) return;
        this._cancelPending();
        this._target = target;
        this._updating = true;
        this.slider.value = Math.max(
            0,
            Math.min(
                1,
                (target.position + seconds * 1000000) / target.duration,
            ),
        );
        this._updating = false;
        this._showTime(this.slider.value * target.duration, target.duration);
        await this._commit();
    }

    async _commit() {
        const target = this._target;
        if (!target || this._busy) return;
        const position = this.slider.value * target.duration;
        this._busy = true;
        this.render();
        try {
            await this._client.seek(position, target);
        } finally {
            this._busy = false;
            this._target = null;
            if (!this._destroyed) this.render();
        }
    }

    start() {
        if (this._timer) return;
        this.render();
        this._client.refreshPosition();
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this.render();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _cancelPending() {
        if (this._pending) GLib.Source.remove(this._pending);
        this._pending = 0;
    }

    stop() {
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = 0;
        this._cancelPending();
        this._target = null;
    }

    destroy() {
        this._destroyed = true;
        this.stop();
    }
}
