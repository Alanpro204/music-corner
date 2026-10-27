// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { LyricsService, lyricsKey } from '../lyrics/service.js';
import { activeLine } from '../lyrics/lrc.js';

export class Lyrics {
    constructor(client, onChange) {
        this._client = client;
        this._onChange = onChange;
        this._service = new LyricsService();
        this._lines = [];
        this._rows = [];
        this._active = -1;
        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: 'mc-lyrics',
            visible: false,
        });
        this._heading = new St.Label({
            text: 'LETRAS',
            style_class: 'mc-lyrics-heading',
        });
        this.actor.add_child(this._heading);
        this.scroll = new St.ScrollView({
            style_class: 'mc-lyrics-scroll',
            overlay_scrollbars: true,
            reactive: true,
            can_focus: true,
            accessible_name: 'Letras de la canción',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        this._content = new St.BoxLayout({
            vertical: true,
            style_class: 'mc-lyrics-content',
            x_expand: true,
        });
        this.scroll.set_child(this._content);
        this.actor.add_child(this.scroll);
        this._resume = new St.Button({
            label: 'Volver a la frase actual',
            can_focus: true,
            style_class: 'mc-selector mc-lyrics-resume',
            visible: false,
        });
        this._resume.connect('clicked', () => {
            this._following = true;
            this._center();
            this._resume.hide();
            this.scroll.grab_key_focus();
        });
        this.actor.add_child(this._resume);
        this._adjustment = this.scroll.get_vadjustment();
        this._adjustment.connect('notify::value', () => {
            if (!this._animating) this._updateFollowing();
        });
        this.scroll.connect('captured-event', (_actor, event) => {
            if (
                [
                    Clutter.EventType.SCROLL,
                    Clutter.EventType.BUTTON_PRESS,
                    Clutter.EventType.TOUCH_BEGIN,
                    Clutter.EventType.KEY_PRESS,
                ].includes(event.type())
            ) {
                this._adjustment.remove_transition('value');
                this._animating = false;
                // Evaluate after St has applied the user's wheel/key/drag movement.
                this._manualUntil = GLib.get_monotonic_time() + 700000;
                this._userScrolling = true;
            }
            if (event.type() === Clutter.EventType.KEY_PRESS) {
                const key = event.get_key_symbol();
                const amounts = {
                    [Clutter.KEY_Up]: -48,
                    [Clutter.KEY_Down]: 48,
                    [Clutter.KEY_Page_Up]: -this._adjustment.page_size,
                    [Clutter.KEY_Page_Down]: this._adjustment.page_size,
                };
                if (key in amounts) {
                    this._adjustment.value = Math.max(
                        0,
                        Math.min(
                            this._adjustment.upper - this._adjustment.page_size,
                            this._adjustment.value + amounts[key],
                        ),
                    );
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.scroll.connect('notify::mapped', () => {
            if (this.scroll.mapped) this._center(false);
        });
    }

    set enabled(value) {
        this.actor.visible = value;
        if (value) {
            this._key = null;
            this._following = true;
            this.render();
        } else {
            this._generation = (this._generation ?? 0) + 1;
            this._service.cancel();
            this.stop();
        }
    }

    resize(height) {
        this._viewportHeight = height;
        this.scroll.set_style(`height: ${height}px;`);
        for (const spacer of this._spacers ?? [])
            spacer.height = Math.max(0, height / 2 - 24);
    }

    start() {
        if (!this.actor.visible || this._timer) return;
        this.render();
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this.render();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = 0;
        this._adjustment.remove_transition('value');
        this._animating = false;
    }

    render(track = this._client.snapshot.selected) {
        if (!this.actor.visible || this._destroyed) return;
        const key = lyricsKey(track);
        if (key !== this._key) {
            this._key = key;
            this._load(track);
        }
        const next = activeLine(this._lines, (track?.position ?? 0) / 1000000);
        this._updateFollowing();
        if (next === this._active) {
            if (
                this._needsCenter &&
                this._following &&
                GLib.get_monotonic_time() >= (this._manualUntil ?? 0)
            )
                this._center();
            return;
        }
        this._rows[this._active]?.remove_style_class_name('mc-lyric-active');
        this._active = next;
        this._needsCenter = true;
        this._rows[next]?.add_style_class_name('mc-lyric-active');
        this._onChange();
        if (
            this._following &&
            GLib.get_monotonic_time() >= (this._manualUntil ?? 0)
        )
            this._center();
    }

    async _load(track) {
        const generation = (this._generation = (this._generation ?? 0) + 1);
        this.stop();
        this._following = true;
        this._manualUntil = 0;
        this._userScrolling = false;
        this._lines = [];
        this._active = -1;
        this._resume.hide();
        this._heading.text = 'LETRAS · LRCLIB';
        this._replace(['Buscando letras…']);
        if (!track) {
            this._service.cancel();
            this._replace(['Reproduce una canción para ver sus letras.']);
            return;
        }
        const result = await this._service.load(track);
        if (this._destroyed || generation !== this._generation || !result)
            return;
        this._lines = result.lines ?? [];
        this._heading.text = this._lines.length
            ? 'LETRAS · SINCRONIZADAS'
            : 'LETRAS';
        this._replace(
            this._lines.length
                ? this._lines.map((line) => line.text)
                : [
                      result.message,
                      ...(result.plain?.split(/\r?\n/) ?? []),
                  ].filter(Boolean),
        );
        this.render();
        this._center(false);
        if (this.actor.mapped) this.start();
    }

    _replace(texts) {
        this._content.destroy_all_children();
        this._spacers = [0, 1].map(
            () =>
                new St.Widget({
                    height: Math.max(0, (this._viewportHeight ?? 300) / 2 - 24),
                }),
        );
        this._content.add_child(this._spacers[0]);
        this._rows = texts.map((text, index) => {
            const row = new St.Label({
                text,
                style_class:
                    !this._lines.length && index === 0
                        ? 'mc-lyrics-message'
                        : 'mc-lyric-line',
                x_expand: true,
            });
            row.clutter_text.line_wrap = true;
            row.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            row.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._content.add_child(row);
            return row;
        });
        this._content.add_child(this._spacers[1]);
        this._adjustment.value = 0;
        this._onChange();
    }

    _updateFollowing() {
        if (this._following && !this._userScrolling) return;
        if (this._animating || !this._rows[this._active] || !this.scroll.mapped)
            return;
        const row = this._rows[this._active];
        const center = row.y + row.height / 2;
        const viewportCenter =
            this._adjustment.value + this._adjustment.page_size / 2;
        const following =
            Math.abs(center - viewportCenter) <=
            this._adjustment.page_size * 0.32;
        const resumed = following && !this._following;
        this._following = following;
        if (GLib.get_monotonic_time() >= (this._manualUntil ?? 0))
            this._userScrolling = false;
        this._resume.visible = !following && this._lines.length > 0;
        if (resumed && GLib.get_monotonic_time() >= (this._manualUntil ?? 0))
            this._center();
    }

    _center(animate = true) {
        if (!this.scroll.mapped) return;
        const row = this._rows[this._active];
        if (
            !row ||
            !row.has_allocation() ||
            !row.height ||
            this._adjustment.page_size <= 0 ||
            this._adjustment.upper < row.y + row.height
        )
            return;
        this._needsCenter = false;
        const target = Math.max(
            0,
            Math.min(
                this._adjustment.upper - this._adjustment.page_size,
                row.y + row.height / 2 - this._adjustment.page_size / 2,
            ),
        );

        this._adjustment.remove_transition('value');
        this._animating = true;
        if (animate)
            this._adjustment.ease(target, {
                duration: 350,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._animating = false;
                },
            });
        else {
            this._adjustment.value = target;
            this._animating = false;
        }
    }

    destroy() {
        this._destroyed = true;
        this._generation++;
        this.stop();
        this._service.destroy();
    }
}
