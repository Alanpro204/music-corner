// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

function textLabel(text, style) {
    const label = new St.Label({ text, style_class: style, x_expand: true });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return label;
}

export class Tracks {
    constructor(client, onChange, onClose) {
        this._client = client;
        this._onChange = onChange;
        this._rows = [];
        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: 'mc-track-panel',
            y_align: Clutter.ActorAlign.START,
            visible: false,
        });
        const header = new St.BoxLayout({
            style_class: 'mc-track-panel-header',
        });
        this._heading = textLabel('Canciones', 'mc-track-panel-title');
        header.add_child(this._heading);
        const close = new St.Button({
            style_class: 'mc-button',
            can_focus: true,
            accessible_name: 'Cerrar lista de canciones',
            child: new St.Icon({
                icon_name: 'window-close-symbolic',
                icon_size: 16,
            }),
        });
        close.connect('clicked', onClose);
        header.add_child(close);
        this.actor.add_child(header);
        this._source = textLabel('', 'mc-hint');
        this.actor.add_child(this._source);
        this._message = new St.Label({ style_class: 'mc-hint' });
        this._message.clutter_text.line_wrap = true;
        this.actor.add_child(this._message);
        this.scroll = new St.ScrollView({
            style_class: 'mc-track-scroll',
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        this._content = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'mc-tracks',
        });
        if (typeof this.scroll.set_child === 'function')
            this.scroll.set_child(this._content);
        else this.scroll.add_actor(this._content);
        this.actor.add_child(this.scroll);
    }

    resize(width, height) {
        this.actor.set_style(`width: ${width}px;`);
        this.scroll.set_style(`height: ${height}px;`);
    }

    render(selected = this._client.snapshot.selected) {
        if (!this.actor.visible) return;
        const list = selected?.trackList;
        const tracks = list?.tracks ?? [];
        this._source.text = selected?.identity ?? 'Sin reproductor';
        this._heading.text = tracks.length
            ? `Canciones · ${tracks.length}`
            : 'Canciones';
        this._message.text = !selected
            ? 'Abre un reproductor para ver sus canciones.'
            : !list?.supported
              ? 'Este reproductor no comparte su lista de canciones por MPRIS.'
              : list.error ||
                (list.loading
                    ? 'Cargando canciones…'
                    : tracks.length
                      ? ''
                      : 'El reproductor comparte una lista vacía.');
        this._message.visible = !!this._message.text;
        this.scroll.visible = tracks.length > 0;
        const signature = JSON.stringify([selected?.name, tracks]);
        if (signature !== this._signature) {
            this._signature = signature;
            const focusedId = this._rows.find(({ button }) =>
                button.has_key_focus(),
            )?.id;
            this._content.destroy_all_children();
            this._rows = tracks.map((track) => {
                const button = new St.Button({
                    style_class: 'mc-track-choice',
                    x_expand: true,
                    can_focus: true,
                    accessible_name: `${track.title}, ${track.artist}`,
                });
                const content = new St.BoxLayout({
                    style_class: 'mc-track-row',
                });
                const marker = new St.Icon({
                    icon_name: 'media-playback-start-symbolic',
                    icon_size: 16,
                });
                content.add_child(marker);
                const labels = new St.BoxLayout({
                    vertical: true,
                    x_expand: true,
                });
                labels.add_child(textLabel(track.title, 'mc-track-name'));
                labels.add_child(textLabel(track.artist, 'mc-hint'));
                content.add_child(labels);
                button.set_child(content);
                const playerName = selected.name;
                button.connect('clicked', () =>
                    this._select(track.id, playerName),
                );
                button.connect('key-focus-in', () => {
                    const adjustment =
                        typeof this.scroll.get_vadjustment === 'function'
                            ? this.scroll.get_vadjustment()
                            : this.scroll.get_vscroll_bar().get_adjustment();
                    const box = button.get_allocation_box();
                    if (box.y1 < adjustment.value) adjustment.value = box.y1;
                    else if (box.y2 > adjustment.value + adjustment.page_size)
                        adjustment.value = box.y2 - adjustment.page_size;
                });
                this._content.add_child(button);
                if (track.id === focusedId) button.grab_key_focus();
                return { id: track.id, button, marker };
            });
        }
        for (const row of this._rows) {
            const current = row.id === selected?.trackId;
            row.marker.opacity = current ? 255 : 0;
            if (current) row.button.add_style_class_name('mc-track-current');
            else row.button.remove_style_class_name('mc-track-current');
            row.button.reactive = !!selected?.canControl && !this._busy;
            row.button.can_focus = row.button.reactive;
            row.button.opacity = row.button.reactive ? 255 : 100;
        }
        this._onChange();
    }

    async _select(id, name) {
        if (this._busy) return;
        this._busy = true;
        this.render();
        try {
            await this._client.goToTrack(id, name);
        } finally {
            this._busy = false;
            if (!this._destroyed) this.render();
        }
    }

    destroy() {
        this._destroyed = true;
        this.actor.destroy();
    }
}
