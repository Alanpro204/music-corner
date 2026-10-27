import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

Gio.Resource.load(
    '/usr/share/gnome-shell/gnome-shell-dbus-interfaces.gresource',
)._register();

Gio.Resource.load(
    '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource',
)._register();
const directory = Gio.File.new_for_path(ARGV[0]);
const [, bytes] = directory.get_child('metadata.json').load_contents(null);
const metadata = JSON.parse(new TextDecoder().decode(bytes));
metadata.dir = directory;
metadata.path = directory.get_path();
const { default: Preferences } = await import(
    directory.get_child('prefs.js').get_uri()
);
Adw.init();
const preferences = new Preferences(metadata);
const window = new Adw.PreferencesWindow();
preferences.fillPreferencesWindow(window);
if (!window.get_visible_page()) throw new Error('Preferencias sin página');
function findColor(widget, name) {
    if (widget instanceof Gtk.ColorDialogButton && widget.name === name)
        return widget;
    for (
        let child = widget.get_first_child();
        child;
        child = child.get_next_sibling()
    ) {
        const result = findColor(child, name);
        if (result) return result;
    }
    return null;
}
function findWidget(widget, type, name = null) {
    if (widget instanceof type && (!name || widget.name === name))
        return widget;
    for (
        let child = widget.get_first_child();
        child;
        child = child.get_next_sibling()
    ) {
        const result = findWidget(child, type, name);
        if (result) return result;
    }
    return null;
}
const settings = preferences.getSettings();
const seekRow = findWidget(window, Adw.SpinRow, 'seek-seconds');
if (!seekRow || seekRow.value !== 5)
    throw new Error('No aparece el intervalo predeterminado de 5 segundos');
seekRow.value = 12;
if (settings.get_uint('seek-seconds') !== 12)
    throw new Error('No se guarda el intervalo de avance y retroceso');
settings.reset('seek-seconds');
if (seekRow.value !== 5)
    throw new Error('No refleja la restauración del intervalo');
const themeRow = findWidget(window, Adw.ComboRow);
if (!themeRow) throw new Error('No aparece el selector de temas');
themeRow.selected = 3;
if (settings.get_string('theme-mode') !== 'ocean')
    throw new Error('No se guarda el tema elegido');
const panelRow = findWidget(window, Adw.SwitchRow);
if (!panelRow) throw new Error('No aparece el interruptor de la barra');
panelRow.active = false;
if (settings.get_boolean('show-panel-icon'))
    throw new Error('No se guarda la visibilidad de la barra');
const chooser = findColor(window, 'accent-color');
if (!chooser) throw new Error('No aparece el selector de acento');
const chosen = new Gdk.RGBA();
chosen.parse('#f7bb65');
chooser.set_rgba(chosen);
if (settings.get_string('accent-color') !== '#f7bb65')
    throw new Error('No se guarda el color elegido');
if (settings.get_string('theme-mode') !== 'custom')
    throw new Error('Elegir un color no activa el tema personalizado');
settings.reset('accent-color');
settings.reset('show-panel-icon');
const defaultColor = new Gdk.RGBA();
defaultColor.parse(settings.get_string('accent-color'));
if (!chooser.get_rgba().equal(defaultColor))
    throw new Error('El selector no refleja la restauración');
window.destroy();
print('PASS: preferencias GTK4 y esquema GSettings');
