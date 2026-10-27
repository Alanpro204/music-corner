import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { BUS_PREFIX } from '../src/mpris/constants.js';

// CLI diagnostic only. The future Shell client must use asynchronous calls.
const [names] = Gio.DBus.session
    .call_sync(
        'org.freedesktop.DBus',
        '/org/freedesktop/DBus',
        'org.freedesktop.DBus',
        'ListNames',
        null,
        new GLib.VariantType('(as)'),
        Gio.DBusCallFlags.NONE,
        3000,
        null,
    )
    .deepUnpack();

const players = names.filter((name) => name.startsWith(BUS_PREFIX)).sort();
print(
    players.length ? players.join('\n') : 'No hay reproductores MPRIS activos.',
);
