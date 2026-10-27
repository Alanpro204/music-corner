// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Artwork } from './artwork.js';
import { PlayerTheme } from './theme.js';
import { Progress } from './progress.js';
import { Lyrics } from './lyrics.js';

function label(text, style) {
    const actor = new St.Label({ text, style_class: style, x_expand: true });
    actor.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return actor;
}

function button(icon, name, callback, style = '') {
    const actor = new St.Button({
        style_class: `mc-button ${style}`,
        can_focus: true,
        accessible_name: name,
        child: new St.Icon({ icon_name: icon, icon_size: 20 }),
    });
    actor.connect('clicked', callback);
    return actor;
}

export class PlayerCard {
    constructor(client, settings, openPreferences) {
        this._client = client;
        this._settings = settings;
        this.actor = new St.BoxLayout({
            name: 'music-companion-card',
            vertical: true,
            reactive: true,
            track_hover: true,
            visible: false,
        });
        this._card = new St.BoxLayout({
            vertical: true,
            style_class: 'mc-card',
        });
        this.actor.add_child(this._card);
        const header = new St.BoxLayout({ style_class: 'mc-header' });
        this.play = button(
            'media-playback-start-symbolic',
            'Reproducir',
            () => this.togglePlayback(),
            'mc-play',
        );
        header.add_child(this.play);
        header.add_child(label('MUSIC CORNER', 'mc-eyebrow'));
        this.lyricsButton = button(
            'view-list-symbolic',
            'Mostrar letras',
            () => this._toggleLyrics(),
            'mc-small',
        );
        header.add_child(this.lyricsButton);
        header.add_child(
            button(
                'emblem-system-symbolic',
                'Preferencias',
                () => {
                    this.close();
                    openPreferences();
                },
                'mc-small',
            ),
        );
        this._closeButton = button(
            'window-close-symbolic',
            'Cerrar menú',
            () => this.close(),
            'mc-small',
        );
        header.add_child(this._closeButton);
        this._card.add_child(header);
        const body = new St.BoxLayout({
            vertical: true,
            style_class: 'mc-body',
        });
        this._card.add_child(body);
        this._lyrics = new Lyrics(client, () => this._theme?.refresh());
        body.add_child(this._lyrics.actor);
        this._track = new St.BoxLayout({ style_class: 'mc-track' });
        this._art = new St.Icon({
            style_class: 'mc-art',
            icon_size: 76,
            icon_name: 'audio-x-generic-symbolic',
        });
        this._artwork = new Artwork(this._art, (color) =>
            this._theme.setCoverColor(color),
        );
        this._track.add_child(this._art);
        const text = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.title = label('Tu música, a un gesto', 'mc-title');
        this.artist = label('Abre un reproductor para empezar', 'mc-artist');
        this._status = label('Sin reproducción', 'mc-status');
        text.add_child(this.title);
        text.add_child(this.artist);
        text.add_child(this._status);
        this._track.add_child(text);
        body.add_child(this._track);
        this.progress = new Progress(client);
        body.add_child(this.progress.actor);
        this.progress.slider.connect('drag-end', () => this._scheduleClose());
        this._controls = new St.BoxLayout({
            style_class: 'mc-controls',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.previous = button(
            'media-skip-backward-symbolic',
            'Canción anterior',
            () => this._command('Previous'),
        );
        this.rewind = button('media-seek-backward-symbolic', 'Retroceder', () =>
            this._skip(-1),
        );
        this.forward = button('media-seek-forward-symbolic', 'Adelantar', () =>
            this._skip(1),
        );
        this.centerPlay = button(
            'media-playback-start-symbolic',
            'Reproducir',
            () => this.togglePlayback(),
            'mc-play-center',
        );
        this.next = button(
            'media-skip-forward-symbolic',
            'Canción siguiente',
            () => this._command('Next'),
        );
        [
            this.previous,
            this.rewind,
            this.centerPlay,
            this.forward,
            this.next,
        ].forEach((control) => this._controls.add_child(control));
        body.add_child(this._controls);
        this._error = label('', 'mc-error');
        this._error.clutter_text.line_wrap = true;
        body.add_child(this._error);
        this._selector = new St.Button({
            style_class: 'mc-selector',
            can_focus: true,
            accessible_name: 'Elegir reproductor',
            label: 'Sin reproductores',
        });
        this._selector.connect('clicked', () => {
            this._players.visible = !this._players.visible;
        });
        body.add_child(this._selector);
        this._players = new St.BoxLayout({
            vertical: true,
            style_class: 'mc-players',
            visible: false,
        });
        body.add_child(this._players);
        body.add_child(
            label('Ctrl + Alt + M para abrir · Esc para cerrar', 'mc-hint'),
        );
        Main.layoutManager.addTopChrome(this.actor, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this.actor.connect('enter-event', () => {
            this._cancelClose();
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('leave-event', () => {
            this._scheduleClose();
            return Clutter.EVENT_PROPAGATE;
        });
        this._stageId = global.stage.connect(
            'captured-event',
            (_stage, event) => this._event(event),
        );
        // Modal grabs start event delivery at this actor instead of the stage.
        this.actor.connect('captured-event', (_actor, event) =>
            this._event(event),
        );
        this._monitorId = Main.layoutManager.connect('monitors-changed', () =>
            this.close(),
        );
        this._overviewId = Main.overview.connect('showing', () => this.close());
        this._theme = new PlayerTheme(settings, this.actor);
        this._seekSettingsId = settings.connect('changed::seek-seconds', () =>
            this._render(this._client.snapshot),
        );
        this._unsubscribe = client.subscribe((snapshot) =>
            this._render(snapshot),
        );
    }

    get isOpen() {
        return this.actor.visible;
    }

    open(keyboard = false) {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || Main.overview.visible || Main.sessionMode.isLocked)
            return;
        this._cancelClose();
        this.actor.set_position(monitor.x, monitor.y);
        // Put the visible button above the corner sensor, so the very next
        // click reaches it without any pointer movement or coordinate warping.
        Main.layoutManager.uiGroup.set_child_above_sibling(this.actor, null);
        this.actor.show();
        this.progress.start();
        this._resizeLyrics();
        this._lyrics.start();
        this._keyboard = keyboard || this._keyboard;
        if (keyboard) {
            if (!this._grab)
                this._grab = Main.pushModal(this.actor, {
                    actionMode: Shell.ActionMode.POPUP,
                });
            (this.play.reactive
                ? this.play
                : this._closeButton
            ).grab_key_focus();
        }
    }

    _resizeLyrics() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        // Reserve room for the footer and the manual-scroll return button.
        const height = Math.max(80, Math.min(300, monitor.height - 500));
        this._lyrics.resize(height);
    }

    _toggleLyrics() {
        const enabled = !this._lyrics.actor.visible;
        this._resizeLyrics();
        this._lyrics.enabled = enabled;
        this.lyricsButton.accessible_name = enabled
            ? 'Ocultar letras'
            : 'Mostrar letras';
        if (enabled) {
            this.lyricsButton.add_style_class_name('mc-lyrics-on');
            if (this.isOpen) this._lyrics.start();
        } else this.lyricsButton.remove_style_class_name('mc-lyrics-on');
        this._theme.refresh();
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open(true);
    }

    togglePlayback() {
        return this._command('PlayPause');
    }

    close() {
        this._cancelClose();
        this.progress.stop();
        this._lyrics.stop();
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        } else if (
            global.stage.get_key_focus() &&
            this.actor.contains(global.stage.get_key_focus())
        )
            global.stage.set_key_focus(null);
        this._keyboard = false;
        this._players.hide();
        this.actor.hide();
    }

    _event(event) {
        if (!this.isOpen) return Clutter.EVENT_PROPAGATE;
        if (event.type() === Clutter.EventType.MOTION && !this._keyboard) {
            const [x, y] = event.get_coords();
            const [ax, ay] = this.actor.get_transformed_position();
            const [width, height] = this.actor.get_transformed_size();
            if (x >= ax && y >= ay && x < ax + width && y < ay + height)
                this._cancelClose();
            else if (!this._closeTimer) this._scheduleClose();
        }
        if (event.type() === Clutter.EventType.KEY_PRESS) {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            const focus = global.stage.get_key_focus();
            if (
                (this._keyboard || (focus && this.actor.contains(focus))) &&
                (key === Clutter.KEY_Tab || key === Clutter.KEY_ISO_Left_Tab)
            ) {
                this._keyboard = true;
                const backwards =
                    key === Clutter.KEY_ISO_Left_Tab ||
                    !!(event.get_state() & Clutter.ModifierType.SHIFT_MASK);
                const direction = backwards
                    ? St.DirectionType.TAB_BACKWARD
                    : St.DirectionType.TAB_FORWARD;
                if (
                    !this.actor.navigate_focus(
                        global.stage.get_key_focus(),
                        direction,
                        false,
                    )
                )
                    this.actor.navigate_focus(null, direction, false);
                return Clutter.EVENT_STOP;
            }
        }
        if (
            event.type() === Clutter.EventType.BUTTON_PRESS ||
            event.type() === Clutter.EventType.TOUCH_BEGIN
        ) {
            const source = event.get_source();
            const [x, y] = event.get_coords();
            const [ax, ay] = this.actor.get_transformed_position();
            const [width, height] = this.actor.get_transformed_size();
            if (
                (x < ax || y < ay || x >= ax + width || y >= ay + height) &&
                !(source && this.anchor?.contains(source))
            ) {
                const modal = !!this._grab;
                this.close();
                if (modal) return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _scheduleClose() {
        this._cancelClose();
        if (this._keyboard) return;
        this._closeTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            this._settings.get_uint('close-delay'),
            () => {
                this._closeTimer = 0;
                const [x, y] = global.get_pointer();
                const [ax, ay] = this.actor.get_transformed_position();
                const [width, height] = this.actor.get_transformed_size();
                if (
                    !this._keyboard &&
                    !this.progress.dragging &&
                    (x < ax || y < ay || x >= ax + width || y >= ay + height)
                )
                    this.close();
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _cancelClose() {
        if (this._closeTimer) GLib.Source.remove(this._closeTimer);
        this._closeTimer = 0;
    }

    async _skip(direction) {
        if (this._busy) return;
        this._busy = true;
        try {
            const pending = this.progress.skip(
                direction * this._settings.get_uint('seek-seconds'),
            );
            this._render(this._client.snapshot);
            await pending;
        } finally {
            this._busy = false;
            if (!this._destroyed) this._render(this._client.snapshot);
        }
    }

    async _command(action) {
        if (this._busy) return;
        this._busy = true;
        this._render(this._client.snapshot);
        try {
            await this._client.command(action);
        } finally {
            this._busy = false;
            if (!this._destroyed) this._render(this._client.snapshot);
        }
    }

    _render({ selected, players, error }) {
        this.progress.render(selected);
        this._lyrics.render(selected);
        this.title.text = selected?.title || 'Tu música, a un gesto';
        this.artist.text =
            selected?.artist || 'Abre un reproductor para empezar';
        this._status.text = selected
            ? ({
                  Playing: 'Reproduciendo',
                  Paused: 'En pausa',
                  Stopped: 'Detenido',
              }[selected.status] ?? '')
            : 'Sin reproducción';
        this._artwork.load(selected?.artUrl || '');
        const playing = selected?.status === 'Playing';
        for (const play of [this.play, this.centerPlay]) {
            play.child.icon_name = playing
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';
            play.accessible_name = playing ? 'Pausar' : 'Reproducir';
        }
        const seconds = this._settings.get_uint('seek-seconds');
        this.rewind.accessible_name = `Retroceder ${seconds} segundos`;
        this.forward.accessible_name = `Adelantar ${seconds} segundos`;
        const enabled = !!selected?.canControl && !this._busy;
        for (const [control, allowed] of [
            [this.previous, selected?.canPrevious],
            [this.play, playing ? selected?.canPause : selected?.canPlay],
            [this.centerPlay, playing ? selected?.canPause : selected?.canPlay],
            [this.next, selected?.canNext],
            [this.rewind, this.progress.canSeek],
            [this.forward, this.progress.canSeek],
        ]) {
            control.reactive = enabled && !!allowed;
            control.can_focus = control.reactive;
            control.opacity = control.reactive ? 255 : 80;
        }
        this._error.text = error;
        this._error.visible = !!error;
        this._selector.label = selected
            ? `${selected.identity}  ▾`
            : 'Sin reproductores MPRIS';
        this._selector.reactive = players.length > 0;
        this._selector.can_focus = players.length > 0;
        const signature = JSON.stringify(
            players.map((player) => [player.name, player.identity]),
        );
        if (signature !== this._playersSignature) {
            this._playersSignature = signature;
            this._players.destroy_all_children();
            for (const player of [
                { name: null, identity: 'Automático · priorizar reproducción' },
                ...players,
            ]) {
                const choice = new St.Button({
                    label: player.identity,
                    can_focus: true,
                    style_class: 'mc-player-choice',
                });
                choice.connect('clicked', () => {
                    this._client.select(player.name);
                    this._players.hide();
                    this._selector.grab_key_focus();
                });
                this._players.add_child(choice);
            }
            this._theme.refresh();
        }
    }

    destroy() {
        this._destroyed = true;
        this.close();
        this._unsubscribe();
        this._settings.disconnect(this._seekSettingsId);
        this._artwork.destroy();
        this.progress.destroy();
        this._lyrics.destroy();
        global.stage.disconnect(this._stageId);
        Main.layoutManager.disconnect(this._monitorId);
        Main.overview.disconnect(this._overviewId);
        this._theme.destroy();
        this.actor.destroy();
    }
}
