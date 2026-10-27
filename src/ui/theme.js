// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';
import {
    COLORS,
    interpolatePalette,
    mix,
    paletteDetails,
    resolvePalette,
} from './palette.js';

const TRANSITION_MS = 200;
const FRAME_MS = 16;

// Inline styles keep palette updates inside the card. Reloading a stylesheet on
// St.Theme invalidates the entire Shell, including third-party panels.
export class PlayerTheme {
    constructor(settings, actor) {
        this._settings = settings;
        this._actor = actor;
        this._widgets = new Map();
        this._palette = resolvePalette(settings);
        this._ink = paletteDetails(this._palette).ink;
        this._settingsId = settings.connect('changed', (_settings, key) => {
            if (
                key === 'theme-mode' ||
                COLORS.some((color) => color.key === key)
            )
                this._transitionTo(
                    resolvePalette(this._settings, this._coverColor),
                );
        });
        this._focusId = global.stage.connect('notify::key-focus', () =>
            this._apply(),
        );
        this._apply();
    }

    setCoverColor(color) {
        if (this._coverColor === color) return;
        this._coverColor = color;
        if (this._settings.get_string('theme-mode') === 'cover')
            this._transitionTo(resolvePalette(this._settings, color));
    }

    refresh() {
        this._apply();
    }

    _transitionTo(target) {
        if (target.every((color, index) => color === this._target?.[index]))
            return;
        if (target.every((color, index) => color === this._palette[index])) {
            this._stop();
            return;
        }
        this._stop();
        this._from = this._palette;
        this._target = target;
        this._fromInk = this._ink;
        this._toInk = paletteDetails(target).ink;
        this._started = GLib.get_monotonic_time();
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
            const elapsed = (GLib.get_monotonic_time() - this._started) / 1000;
            const progress = Math.min(1, elapsed / TRANSITION_MS);
            this._palette = interpolatePalette(
                this._from,
                this._target,
                progress,
            );
            this._ink = mix(this._fromInk, this._toInk, progress);
            this._apply();
            if (progress < 1) return GLib.SOURCE_CONTINUE;
            this._timer = 0;
            this._target = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _stop() {
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = 0;
        this._target = null;
    }

    _apply() {
        const colors = paletteDetails(this._palette);
        colors.ink = this._ink;
        const focus = global.stage.get_key_focus();
        const visit = (actor) => {
            if (typeof actor.get_style_class_name === 'function') {
                const classes = new Set(
                    (actor.get_style_class_name() || '').split(/\s+/),
                );
                const interactive =
                    classes.has('mc-button') ||
                    classes.has('mc-selector') ||
                    classes.has('mc-player-choice') ||
                    classes.has('mc-seek');
                if (interactive && !this._widgets.has(actor)) {
                    actor.track_hover = true;
                    const hoverId = actor.connect('notify::hover', () =>
                        this._apply(),
                    );
                    const destroyId = actor.connect('destroy', () =>
                        this._widgets.delete(actor),
                    );
                    this._widgets.set(actor, { hoverId, destroyId });
                }
                const highlighted =
                    interactive && (actor.hover || actor === focus);
                const focused = interactive && actor === focus;
                let style = null;
                if (classes.has('mc-card'))
                    style = `color: ${colors.text}; background-color: ${colors.background}; border-color: ${colors.border};`;
                else if (
                    classes.has('mc-eyebrow') ||
                    classes.has('mc-artist') ||
                    classes.has('mc-hint') ||
                    classes.has('mc-time')
                )
                    style = `color: ${colors.muted};`;
                else if (classes.has('mc-lyric-active'))
                    style = `color: ${colors.text};`;
                else if (
                    classes.has('mc-lyric-line') ||
                    classes.has('mc-lyrics-heading') ||
                    classes.has('mc-lyrics-message')
                )
                    style = `color: ${colors.muted};`;
                else if (classes.has('mc-lyrics-on'))
                    style = `color: ${colors.accent}; background-color: ${colors.surface};${highlighted ? ` box-shadow: inset 0 0 0 2px ${colors.accent};` : ''}`;
                else if (classes.has('mc-status'))
                    style = `color: ${colors.accent};`;
                else if (classes.has('mc-seek'))
                    style = `color: ${colors.accent}; -barlevel-background-color: ${colors.surface}; -barlevel-active-background-color: ${colors.accent};${focused ? ` box-shadow: inset 0 0 0 2px ${colors.accent};` : ''}`;
                else if (classes.has('mc-art'))
                    style = `color: ${colors.accent}; background-color: ${colors.surface};`;
                else if (
                    classes.has('mc-play') ||
                    classes.has('mc-play-center')
                )
                    style = `color: ${colors.ink}; background-color: ${colors.accent};${highlighted ? ` box-shadow: inset 0 0 0 2px ${colors.ink};` : ''}`;
                else if (interactive)
                    style = `color: ${colors.text}; background-color: ${classes.has('mc-small') ? 'transparent' : highlighted ? colors.hover : colors.surface};${highlighted ? ` box-shadow: inset 0 0 0 2px ${colors.accent};` : ''}`;
                if (style !== null && actor.get_style() !== style)
                    actor.set_style(style);
            }
            for (const child of actor.get_children()) visit(child);
        };
        visit(this._actor);
    }

    destroy() {
        this._stop();
        this._settings.disconnect(this._settingsId);
        global.stage.disconnect(this._focusId);
        for (const [actor, { hoverId, destroyId }] of this._widgets) {
            actor.disconnect(hoverId);
            actor.disconnect(destroyId);
        }
        this._widgets.clear();
    }
}
