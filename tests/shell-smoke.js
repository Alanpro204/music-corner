import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import { startMockPlayer } from '../tools/mock-player.js';

const UUID = 'music-companion@alanpro.dev';
export const METRICS = {};
async function until(predicate, message) {
    for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await Scripting.sleep(60);
    }
    throw new Error(message);
}
function assert(condition, message) {
    if (!condition) throw new Error(message);
}

export async function run() {
    const cover = Gio.File.new_for_uri(import.meta.url)
        .get_parent()
        .get_child('fixtures/cover.svg')
        .get_uri();
    const wideCover = Gio.File.new_for_uri(import.meta.url)
        .get_parent()
        .get_child('fixtures/cover-wide.svg')
        .get_uri();
    const stop = startMockPlayer({ artUrl: cover, omitTrackId: true });
    const seat = Clutter.get_default_backend().get_default_seat();
    const pointer = seat.create_virtual_device(
        Clutter.InputDeviceType.POINTER_DEVICE,
    );
    const keyboard = seat.create_virtual_device(
        Clutter.InputDeviceType.KEYBOARD_DEVICE,
    );
    const move = (x, y) =>
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
    const key = (keyval, state) =>
        keyboard.notify_keyval(GLib.get_monotonic_time(), keyval, state);
    const clickHere = () => {
        pointer.notify_button(
            GLib.get_monotonic_time(),
            Clutter.BUTTON_PRIMARY,
            Clutter.ButtonState.PRESSED,
        );
        pointer.notify_button(
            GLib.get_monotonic_time(),
            Clutter.BUTTON_PRIMARY,
            Clutter.ButtonState.RELEASED,
        );
    };
    const click = async (actor) => {
        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        move(x + width / 2, y + height / 2);
        await Scripting.sleep(80);
        clickHere();
    };
    try {
        await until(() => Main.panel.statusArea[UUID], 'La extensión no cargó');
        const extension = Main.extensionManager.lookup(UUID).stateObj;
        const appearanceSettings = extension.getSettings();
        appearanceSettings.set_boolean('show-panel-icon', false);
        await until(
            () => !Main.panel.statusArea[UUID].visible,
            'No oculta el icono de la barra',
        );
        const interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        interfaceSettings.set_boolean('enable-hot-corners', true);
        Main.overview.hide();
        await Scripting.sleep(600);
        await until(
            () => extension.client.snapshot.selected,
            'No descubre MPRIS desde Shell',
        );
        const monitor = Main.layoutManager.primaryMonitor;
        move(monitor.x + 500, monitor.y + 400);
        await Scripting.sleep(100);
        move(monitor.x, monitor.y);
        await until(
            () => extension.card.isOpen,
            'La esquina no abre la tarjeta',
        );
        appearanceSettings.set_boolean('show-panel-icon', true);
        await until(
            () => Main.panel.statusArea[UUID].visible,
            'No recupera el icono de la barra',
        );
        assert(!Main.overview.visible, 'La esquina activó también Actividades');
        await Scripting.sleep(250);
        assert(
            extension.card.title.text === 'Canción de prueba',
            'Título incorrecto',
        );
        const [playX, playY] = extension.card.play.get_transformed_position();
        assert(
            playX === monitor.x && playY === monitor.y,
            'El botón no está pegado a la esquina',
        );
        const target = global.stage.get_actor_at_pos(
            Clutter.PickMode.REACTIVE,
            monitor.x,
            monitor.y,
        );
        assert(
            target === extension.card.play ||
                extension.card.play.contains(target),
            'La esquina intercepta el clic sobre pausa',
        );
        // Do not move the pointer: arriving at the exact screen corner must be enough.
        clickHere();
        await until(
            () => extension.card._art.gicon instanceof Gio.BytesIcon,
            'No carga la carátula local',
        );
        appearanceSettings.set_string('theme-mode', 'ocean');
        await until(() => {
            const color = extension.card.play
                .get_theme_node()
                .get_background_color();
            return (
                color.red === 105 && color.green === 214 && color.blue === 236
            );
        }, 'No aplica el tema predefinido');
        appearanceSettings.set_string('theme-mode', 'cover');
        await until(
            () => extension.card._theme._coverColor,
            'No extrae el color de la carátula',
        );
        await until(
            () => !extension.card._theme._timer,
            'No termina el primer cambio de paleta',
        );
        const previousAccent = extension.card._theme._palette[3];
        const previousBackground = extension.card._theme._palette[0];
        const previousIcon = extension.card._art.gicon;
        stop.setArtUrl(wideCover);
        assert(
            extension.card._art.gicon === previousIcon &&
                extension.card._theme._palette[0] === previousBackground,
            'Descarta la carátula y sus colores antes de cargar la siguiente',
        );
        await until(
            () => extension.card._theme._coverColor === '#f09040',
            'No actualiza el color con la canción',
        );
        assert(
            extension.card._theme._palette[0] !== '#171c26',
            'La paleta pasa por los colores base al cambiar de canción',
        );
        await Scripting.sleep(70);
        const intermediateAccent = extension.card._theme._palette[3];
        assert(
            intermediateAccent !== previousAccent &&
                intermediateAccent !== '#f09040',
            'El cambio de paleta no tiene un color intermedio',
        );
        await until(
            () => !extension.card._theme._timer,
            'La transición de 200 ms no termina',
        );
        assert(
            extension.card._theme._palette[3] === '#f09040',
            'La transición no termina en el color de la nueva carátula',
        );
        const iconBytes = extension.card._art.gicon.get_bytes().toArray();
        const loader = new GdkPixbuf.PixbufLoader();
        loader.write(iconBytes);
        loader.close();
        const renderedCover = loader.get_pixbuf();
        assert(
            renderedCover.get_width() === 76 &&
                renderedCover.get_height() === 76,
            'La carátula no llena un cuadrado de 76 px',
        );
        const coverPixels = renderedCover.get_pixels();
        const pixelStride = renderedCover.get_rowstride();
        const center = 38 * pixelStride + 38 * 4;
        assert(
            coverPixels[center] === 240 &&
                coverPixels[center + 1] === 144 &&
                coverPixels[center + 2] === 64,
            'La carátula horizontal conserva bandas laterales',
        );
        assert(
            coverPixels[3] === 0 && coverPixels[center + 3] === 255,
            'La carátula no tiene esquinas redondeadas',
        );
        await until(() => {
            const color = extension.card.play
                .get_theme_node()
                .get_background_color();
            return (
                color.red === 240 && color.green === 144 && color.blue === 64
            );
        }, 'No aplica el acento extraído de la carátula');
        appearanceSettings.set_string('theme-mode', 'custom');
        await until(
            () => extension.client.snapshot.selected.status === 'Paused',
            'El botón no pausa',
        );
        await until(() => extension.card.play.reactive, 'Pausa sigue ocupada');
        clickHere();
        await until(
            () => extension.client.snapshot.selected.status === 'Playing',
            'El segundo clic inmóvil no reanuda',
        );
        await Scripting.sleep(150);
        assert(
            extension.client.snapshot.selected.status === 'Playing',
            'Un clic se ejecutó dos veces',
        );
        await click(extension.card.centerPlay);
        await until(
            () => extension.client.snapshot.selected.status === 'Paused',
            'El botón central no pausa',
        );
        assert(
            extension.card.play.child.icon_name ===
                extension.card.centerPlay.child.icon_name,
            'Los botones de reproducción no están sincronizados',
        );
        await until(
            () => extension.card.centerPlay.reactive,
            'El botón central sigue ocupado',
        );
        await click(extension.card.centerPlay);
        await until(
            () => extension.client.snapshot.selected.status === 'Playing',
            'El botón central no reanuda',
        );
        await click(extension.card.next);
        await until(
            () => extension.card.title.text === 'Segunda canción',
            'El botón no cambia de pista',
        );
        stop.update({ CanGoNext: false });
        await until(
            () => !extension.card.next.reactive,
            'El botón ignora CanGoNext',
        );
        const progress = extension.card.progress;
        assert(progress.duration.text === '3:00', 'No muestra duración');
        await click(extension.card.centerPlay);
        await until(
            () => extension.client.snapshot.selected.status === 'Paused',
            'No pausa antes de buscar',
        );
        assert(
            appearanceSettings.get_uint('seek-seconds') === 5,
            'El salto predeterminado no es de 5 segundos',
        );
        assert(
            extension.card._controls
                .get_children()
                .every(
                    (control, index) =>
                        control ===
                        [
                            extension.card.previous,
                            extension.card.rewind,
                            extension.card.centerPlay,
                            extension.card.forward,
                            extension.card.next,
                        ][index],
                ),
            'Orden incorrecto de controles',
        );
        await extension.client.seek(
            30000000,
            extension.client.snapshot.selected,
        );
        await click(extension.card.forward);
        await until(
            () => extension.client.snapshot.selected.position === 35000000,
            'Adelantar no salta 5 segundos',
        );
        await until(
            () => extension.card.forward.reactive,
            'Avance sigue ocupado',
        );
        appearanceSettings.set_uint('seek-seconds', 12);
        await until(
            () =>
                extension.card.forward.accessible_name ===
                'Adelantar 12 segundos',
            'No actualiza el intervalo en vivo',
        );
        await click(extension.card.forward);
        await until(
            () => extension.client.snapshot.selected.position === 47000000,
            'Adelantar ignora el intervalo configurado',
        );
        await until(
            () => extension.card.rewind.reactive,
            'Retroceso sigue ocupado',
        );
        await click(extension.card.rewind);
        await until(
            () => extension.client.snapshot.selected.position === 35000000,
            'Retroceder ignora el intervalo configurado',
        );
        await until(
            () => extension.card.rewind.reactive,
            'Retroceso sigue ocupado',
        );
        await extension.client.seek(
            2000000,
            extension.client.snapshot.selected,
        );
        await click(extension.card.rewind);
        await until(
            () => extension.client.snapshot.selected.position === 0,
            'Retroceder no limita el inicio',
        );
        await until(
            () => extension.card.forward.reactive,
            'Avance sigue ocupado',
        );
        await extension.client.seek(
            179000000,
            extension.client.snapshot.selected,
        );
        await click(extension.card.forward);
        await until(
            () => extension.client.snapshot.selected.position === 180000000,
            'Adelantar no limita el final',
        );
        await until(
            () => progress.slider.reactive,
            'Barra sigue ocupada tras avance',
        );
        appearanceSettings.reset('seek-seconds');
        await click(progress.slider);
        await until(
            () =>
                Math.abs(
                    extension.client.snapshot.selected.position - 90000000,
                ) < 2000000,
            'Clic en barra no salta a la mitad',
        );
        await until(
            () => progress.elapsed.text === '1:30',
            'No muestra tiempo tras buscar',
        );
        progress.slider.grab_key_focus();
        key(Clutter.KEY_Right, Clutter.KeyState.PRESSED);
        key(Clutter.KEY_Right, Clutter.KeyState.RELEASED);
        await until(
            () =>
                Math.abs(
                    extension.client.snapshot.selected.position - 108000000,
                ) < 2000000,
            'Flecha no adelanta',
        );
        await until(() => progress.slider.reactive, 'Barra sigue ocupada');
        const [sx, sy] = progress.slider.get_transformed_position();
        const [sw, sh] = progress.slider.get_transformed_size();
        move(sx + sw / 2, sy + sh / 2);
        await Scripting.sleep(80);
        pointer.notify_button(
            GLib.get_monotonic_time(),
            Clutter.BUTTON_PRIMARY,
            Clutter.ButtonState.PRESSED,
        );
        await Scripting.sleep(80);
        move(sx + sw * 0.75, sy + sh / 2);
        await Scripting.sleep(100);
        pointer.notify_button(
            GLib.get_monotonic_time(),
            Clutter.BUTTON_PRIMARY,
            Clutter.ButtonState.RELEASED,
        );
        await until(
            () =>
                Math.abs(
                    extension.client.snapshot.selected.position - 135000000,
                ) < 3000000,
            'Arrastrar no cambia posición',
        );
        await until(
            () => progress.slider.reactive,
            'Barra sigue ocupada tras arrastrar',
        );
        move(sx + sw / 2, sy + sh / 2);
        await Scripting.sleep(80);
        pointer.notify_button(
            GLib.get_monotonic_time(),
            Clutter.BUTTON_PRIMARY,
            Clutter.ButtonState.PRESSED,
        );
        await until(() => progress.dragging, 'No inicia segundo arrastre');
        await extension.client.command('Previous');
        await until(
            () => extension.card.title.text === 'Canción de prueba',
            'No cambia pista durante arrastre',
        );
        move(sx + sw * 0.8, sy + sh / 2);
        await Scripting.sleep(100);
        pointer.notify_button(
            GLib.get_monotonic_time(),
            Clutter.BUTTON_PRIMARY,
            Clutter.ButtonState.RELEASED,
        );
        await Scripting.sleep(300);
        assert(
            extension.client.snapshot.selected.position === 0,
            'Aplica arrastre obsoleto a pista nueva',
        );
        stop.update({ Position: 135000000 });
        await until(
            () => progress.elapsed.text === '2:15',
            'No refleja búsqueda externa',
        );
        stop.update({ CanSeek: false });
        await until(() => !progress.slider.reactive, 'Barra ignora CanSeek');
        assert(
            !extension.card.rewind.reactive && !extension.card.forward.reactive,
            'Los saltos ignoran CanSeek',
        );
        stop.update({ CanSeek: true });
        await until(() => progress.slider.reactive, 'Barra no se reactiva');
        const animations = interfaceSettings.get_boolean('enable-animations');
        interfaceSettings.set_boolean('enable-animations', true);
        const lyrics = extension.card._lyrics;
        const originalLoad = lyrics._service.load.bind(lyrics._service);
        lyrics._service.load = async () => ({
            lines: Array.from({ length: 60 }, (_, i) => ({
                time: i * 3,
                text: `Frase de prueba ${i + 1}`,
            })),
        });
        await click(extension.card.lyricsButton);
        await until(
            () => lyrics._rows.length === 60 && lyrics._rows[45].height > 0,
            'No muestra las letras',
        );
        await until(
            () => lyrics._active === 45 && lyrics._following,
            'No sincroniza letras con la posición actual',
        );
        assert(
            extension.card._track.y > lyrics.actor.y + lyrics.actor.height,
            'La información de la canción no queda debajo de las letras',
        );
        assert(
            extension.card.actor.height <= monitor.height,
            `La tarjeta con letras sale del monitor: ${extension.card.actor.height}/${monitor.height}, scroll ${lyrics.scroll.height}`,
        );
        stop.update({ Position: 30000000 });
        await until(
            () => lyrics._active === 10,
            'No sigue una búsqueda hacia atrás',
        );
        await Scripting.sleep(500);
        const lyricsScreenshot = GLib.getenv('MC_LYRICS_SCREENSHOT');
        if (lyricsScreenshot) {
            const stream = Gio.File.new_for_path(lyricsScreenshot).replace(
                null,
                false,
                Gio.FileCreateFlags.NONE,
                null,
            );
            await new Shell.Screenshot().screenshot(false, stream);
            stream.close(null);
        }
        const centered = lyrics._adjustment.value;
        assert(
            centered > 0,
            `No desplaza hasta la frase actual: value=${lyrics._adjustment.value}, upper=${lyrics._adjustment.upper}, page=${lyrics._adjustment.page_size}, row=${lyrics._rows[10].y}, follow=${lyrics._following}`,
        );
        lyrics.scroll.grab_key_focus();
        key(Clutter.KEY_Page_Down, Clutter.KeyState.PRESSED);
        key(Clutter.KEY_Page_Down, Clutter.KeyState.RELEASED);
        await until(
            () => !lyrics._following && lyrics._resume.visible,
            'No pausa seguimiento al leer otra parte',
        );
        const manual = lyrics._adjustment.value;
        stop.update({ Position: 33000000 });
        await until(
            () => lyrics._active === 11,
            'No resalta mientras se lee otra parte',
        );
        await Scripting.sleep(800);
        assert(
            Math.abs(lyrics._adjustment.value - manual) < 2,
            'El scroll automático interrumpe la lectura manual',
        );
        const row = lyrics._rows[11];
        lyrics._adjustment.value =
            row.y + row.height / 2 - lyrics._adjustment.page_size / 2;
        await until(
            () => lyrics._following,
            'No retoma seguimiento al volver a la frase',
        );
        stop.update({ Position: 60000000 });
        await until(
            () => lyrics._active === 20,
            'No sigue búsqueda hacia adelante',
        );
        await Scripting.sleep(500);
        assert(
            lyrics._adjustment.value > manual,
            `No vuelve a desplazar automáticamente: value=${lyrics._adjustment.value}, manual=${manual}, row=${lyrics._rows[20].y}, follow=${lyrics._following}, anim=${lyrics._animating}, timer=${lyrics._timer}, upper=${lyrics._adjustment.upper}, page=${lyrics._adjustment.page_size}, scrollheight=${lyrics.scroll.height}, contentheight=${lyrics._content.height}`,
        );
        lyrics.scroll.grab_key_focus();
        key(Clutter.KEY_Page_Up, Clutter.KeyState.PRESSED);
        key(Clutter.KEY_Page_Up, Clutter.KeyState.RELEASED);
        await until(
            () => lyrics._resume.visible,
            'No ofrece volver a la frase',
        );
        await click(lyrics._resume);
        await until(
            () => lyrics._following && !lyrics._resume.visible,
            'El botón no retoma seguimiento',
        );
        stop.update({ Position: 62800000, PlaybackStatus: 'Playing' });
        await until(
            () => lyrics._active === 21,
            'Las letras no avanzan con el reloj de reproducción',
        );
        stop.update({ PlaybackStatus: 'Paused' });
        await Scripting.sleep(400);
        assert(lyrics._active === 21, 'Las letras siguen avanzando en pausa');
        await click(extension.card.lyricsButton);
        await until(
            () => !lyrics.actor.visible && !lyrics._timer,
            'Ocultar letras deja un reloj activo',
        );
        // A late response must not overwrite the next track's lyrics.
        let resolveOld;
        lyrics._service.load = () =>
            new Promise((resolve) => {
                resolveOld = resolve;
            });
        await click(extension.card.lyricsButton);
        await until(() => resolveOld, 'No inicia carga de letras');
        lyrics._service.load = async () => ({
            message: 'Instrumental de prueba',
        });
        stop.update({ CanGoNext: true });
        await until(
            () => extension.client.snapshot.selected.canNext,
            'No activa siguiente para probar cambio de letras',
        );
        await extension.client.command('Next');
        await until(
            () => lyrics._rows[0]?.text === 'Instrumental de prueba',
            'No muestra estado instrumental',
        );
        resolveOld({ lines: [{ time: 0, text: 'Respuesta obsoleta' }] });
        await Scripting.sleep(150);
        assert(
            lyrics._rows[0].text === 'Instrumental de prueba',
            'Acepta letras de una pista anterior',
        );
        await click(extension.card.lyricsButton);
        lyrics._service.load = originalLoad;
        interfaceSettings.set_boolean('enable-animations', animations);
        await extension.client.command('Previous');
        stop.update({ Position: 135000000 });
        await click(extension.card.centerPlay);
        await until(
            () => extension.client.snapshot.selected.status === 'Playing',
            'No reanuda después de buscar',
        );
        const screenshotPath = GLib.getenv('MC_SCREENSHOT');
        const paletteSettings = extension.getSettings();
        paletteSettings.set_string('accent-color', '#f7bb65');
        await until(() => {
            const color = extension.card.play
                .get_theme_node()
                .get_background_color();
            return (
                color.red === 247 && color.green === 187 && color.blue === 101
            );
        }, 'No aplica el acento en vivo');
        const centerColor = extension.card.centerPlay
            .get_theme_node()
            .get_background_color();
        assert(
            centerColor.red === 247 &&
                centerColor.green === 187 &&
                centerColor.blue === 101,
            'El botón central no usa el color elegido',
        );
        if (screenshotPath) {
            const stream = Gio.File.new_for_path(screenshotPath).replace(
                null,
                false,
                Gio.FileCreateFlags.NONE,
                null,
            );
            await new Shell.Screenshot().screenshot(false, stream);
            stream.close(null);
        }
        paletteSettings.reset('accent-color');
        move(monitor.x + 700, monitor.y + 500);
        await until(() => !extension.card.isOpen, 'No oculta al salir');
        assert(!progress._timer, 'Deja reloj activo al cerrar');
        // Clicking before the hover delay must work once, without waiting or moving.
        const settings = extension.getSettings();
        settings.set_uint('open-delay', 2000);
        move(monitor.x + 1, monitor.y + 1);
        await Scripting.sleep(80);
        assert(
            !extension.card.isOpen,
            'La tarjeta ignoró el retardo de prueba',
        );
        clickHere();
        await until(
            () =>
                extension.card.isOpen &&
                extension.client.snapshot.selected.status === 'Paused',
            'El clic antes del retardo no pausa',
        );
        await Scripting.sleep(200);
        assert(
            extension.client.snapshot.selected.status === 'Paused',
            'El clic rápido se ejecutó dos veces',
        );
        settings.set_uint('open-delay', 200);
        move(monitor.x + 700, monitor.y + 500);
        await until(
            () => !extension.card.isOpen,
            'No oculta después del clic rápido',
        );
        key(Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
        key(Clutter.KEY_Alt_L, Clutter.KeyState.PRESSED);
        key(Clutter.KEY_m, Clutter.KeyState.PRESSED);
        key(Clutter.KEY_m, Clutter.KeyState.RELEASED);
        key(Clutter.KEY_Alt_L, Clutter.KeyState.RELEASED);
        key(Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
        await until(() => extension.card.isOpen, 'El atajo no abre');
        key(Clutter.KEY_Tab, Clutter.KeyState.PRESSED);
        key(Clutter.KEY_Tab, Clutter.KeyState.RELEASED);
        await Scripting.sleep(150);
        assert(
            extension.card.actor.contains(global.stage.get_key_focus()),
            'Tab saca el foco de la tarjeta',
        );
        lyrics._service.load = async () => ({
            lines: [{ time: 0, text: 'Frase para comprobar cierre' }],
        });
        await click(extension.card.lyricsButton);
        await until(
            () => lyrics.actor.visible && lyrics._timer,
            'No inicia reloj de letras al reabrir',
        );
        key(Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
        key(Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
        await until(() => !extension.card.isOpen, 'Escape no cierra');
        assert(!lyrics._timer, 'Cerrar el menú deja el reloj de letras activo');
        stop();
        await until(
            () => !extension.client.snapshot.selected,
            'No detecta cierre del reproductor',
        );
        assert(
            !extension.card.play.reactive,
            'Estado vacío deja controles activos',
        );
        Main.extensionManager.disableExtension(UUID);
        await until(
            () => !Main.panel.statusArea[UUID],
            'disable() dejó el indicador',
        );
        assert(
            !Main.layoutManager.uiGroup
                .get_children()
                .some(
                    (actor) =>
                        actor.name === 'music-companion-card' ||
                        actor.name === 'music-companion-hot-corner',
                ),
            'Quedan actores tras disable',
        );
        assert(
            Main.layoutManager.hotCorners[Main.layoutManager.primaryIndex],
            'No restaura la esquina de Actividades',
        );
        Main.extensionManager.enableExtension(UUID);
        await until(() => Main.panel.statusArea[UUID], 'No se puede reactivar');
        const prefs = Gio.File.new_for_uri(import.meta.url)
            .get_parent()
            .get_child('prefs-smoke.js')
            .get_path();
        const process = Gio.Subprocess.new(
            [
                'env',
                'GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0',
                'LD_LIBRARY_PATH=/usr/lib/gnome-shell',
                'gjs',
                '-m',
                prefs,
                extension.path,
            ],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        );
        await new Promise((resolve, reject) =>
            process.communicate_utf8_async(null, null, (child, result) => {
                try {
                    const [, output, errors] =
                        child.communicate_utf8_finish(result);
                    if (!child.get_successful()) throw new Error(errors);
                    print(output);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }),
        );
        print(
            'PASS: GNOME Shell esquina, controles, atajo, teclado, cierre y limpieza',
        );
    } finally {
        stop();
        pointer.run_dispose();
        keyboard.run_dispose();
    }
}
