// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { COLORS, THEMES, readColor, toHex } from './ui/palette.js';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: 'Music Corner',
            icon_name: 'audio-x-generic-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: 'Esquina superior izquierda',
            description:
                'En el monitor principal. Ctrl+Alt+M abre el menú; Escape lo cierra.',
        });
        for (const [key, title, upper] of [
            ['open-delay', 'Espera para abrir (ms)', 2000],
            ['close-delay', 'Espera para ocultar (ms)', 3000],
        ]) {
            const row = new Adw.SpinRow({
                title,
                adjustment: new Gtk.Adjustment({
                    lower: key === 'open-delay' ? 50 : 100,
                    upper,
                    step_increment: 50,
                    page_increment: 100,
                }),
            });
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        }
        const panelRow = new Adw.SwitchRow({
            title: 'Mostrar icono en la barra superior',
            subtitle:
                'La esquina y Ctrl+Alt+M siguen disponibles al ocultarlo.',
        });
        settings.bind(
            'show-panel-icon',
            panelRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        group.add(panelRow);
        page.add(group);
        const playback = new Adw.PreferencesGroup({ title: 'Reproducción' });
        const seekRow = new Adw.SpinRow({
            name: 'seek-seconds',
            title: 'Avance y retroceso (segundos)',
            subtitle: 'Intervalo de ambos botones. Por defecto: 5 segundos.',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 300,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        settings.bind(
            'seek-seconds',
            seekRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        playback.add(seekRow);
        page.add(playback);
        const appearance = new Adw.PreferencesGroup({
            title: 'Tema y colores',
            description:
                'Los temas se aplican al instante. Al elegir un color, se activa Personalizado.',
        });
        const connections = [];
        const themeRow = new Adw.ComboRow({
            title: 'Tema',
            model: Gtk.StringList.new(THEMES.map((theme) => theme.title)),
        });
        const syncTheme = () => {
            const index = THEMES.findIndex(
                (theme) => theme.id === settings.get_string('theme-mode'),
            );
            themeRow.selected = Math.max(0, index);
        };
        syncTheme();
        themeRow.connect('notify::selected', () => {
            const theme = THEMES[themeRow.selected];
            if (theme && settings.get_string('theme-mode') !== theme.id)
                settings.set_string('theme-mode', theme.id);
        });
        connections.push(settings.connect('changed::theme-mode', syncTheme));
        appearance.add(themeRow);
        for (const definition of COLORS) {
            const row = new Adw.ActionRow({ title: definition.title });
            const chooser = new Gtk.ColorDialogButton({
                name: definition.key,
                dialog: new Gtk.ColorDialog({
                    title: definition.title,
                    with_alpha: false,
                }),
                valign: Gtk.Align.CENTER,
                tooltip_text: definition.title,
            });
            let syncing = false;
            const sync = () => {
                syncing = true;
                const color = readColor(settings, definition);
                const rgba = new Gdk.RGBA();
                rgba.parse(color);
                chooser.set_rgba(rgba);
                row.subtitle = color.toUpperCase();
                syncing = false;
            };
            sync();
            chooser.connect('notify::rgba', () => {
                if (syncing) return;
                const rgba = chooser.get_rgba();
                settings.set_string(
                    definition.key,
                    toHex(rgba.red, rgba.green, rgba.blue),
                );
                settings.set_string('theme-mode', 'custom');
            });
            connections.push(
                settings.connect(`changed::${definition.key}`, sync),
            );
            row.add_suffix(chooser);
            row.activatable_widget = chooser;
            appearance.add(row);
        }
        const resetRow = new Adw.ActionRow({
            title: 'Restablecer colores originales',
        });
        const reset = new Gtk.Button({
            label: 'Restablecer',
            valign: Gtk.Align.CENTER,
        });
        reset.connect('clicked', () => {
            COLORS.forEach(({ key }) => settings.reset(key));
            settings.set_string('theme-mode', 'custom');
        });
        resetRow.add_suffix(reset);
        appearance.add(resetRow);
        window.connect('destroy', () =>
            connections.forEach((id) => settings.disconnect(id)),
        );
        page.add(appearance);
        window.add(page);
    }
}
