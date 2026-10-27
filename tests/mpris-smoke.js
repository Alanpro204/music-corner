import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { startMockPlayer, MOCK_BUS_NAME } from '../tools/mock-player.js';
import { OBJECT_PATH, PLAYER_INTERFACE } from '../src/mpris/constants.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

const stop = startMockPlayer();
const bus = Gio.DBus.session;
const call = (iface, method, parameters = null) =>
    bus.call(
        MOCK_BUS_NAME,
        OBJECT_PATH,
        iface,
        method,
        parameters,
        null,
        Gio.DBusCallFlags.NONE,
        3000,
        null,
    );

async function property(name) {
    const result = await call(
        'org.freedesktop.DBus.Properties',
        'Get',
        new GLib.Variant('(ss)', [PLAYER_INTERFACE, name]),
    );
    return result.deepUnpack()[0].deepUnpack();
}

function assert(value, message) {
    if (!value) throw new Error(message);
}

try {
    // The name request is queued before these calls on the same connection.
    assert(
        (await property('PlaybackStatus')) === 'Playing',
        'Estado inicial incorrecto',
    );
    let changes = 0;
    const subscription = bus.signal_subscribe(
        MOCK_BUS_NAME,
        'org.freedesktop.DBus.Properties',
        'PropertiesChanged',
        OBJECT_PATH,
        null,
        Gio.DBusSignalFlags.NONE,
        () => changes++,
    );
    try {
        await call(PLAYER_INTERFACE, 'PlayPause');
        assert(
            (await property('PlaybackStatus')) === 'Paused',
            'PlayPause no pausa',
        );
        await call(PLAYER_INTERFACE, 'Next');
        const metadata = await property('Metadata');
        assert(
            metadata['xesam:title'].deepUnpack() === 'Segunda canción',
            'Next no cambia metadatos',
        );
        await call(PLAYER_INTERFACE, 'Previous');
        await call(PLAYER_INTERFACE, 'Play');
        assert(
            (await property('PlaybackStatus')) === 'Playing',
            'Play no reanuda',
        );
        assert(changes >= 4, 'Faltan señales de actualización MPRIS');
    } finally {
        bus.signal_unsubscribe(subscription);
    }
    print('PASS: MPRIS simulado, reproducción, metadatos y señales D-Bus');
} finally {
    stop();
}
