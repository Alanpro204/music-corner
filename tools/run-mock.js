import GLib from 'gi://GLib';
import { startMockPlayer } from './mock-player.js';

const loop = new GLib.MainLoop(null, false);
const stop = startMockPlayer();
const signals = [2, 15].map((signal) =>
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal, () => {
        loop.quit();
        return GLib.SOURCE_CONTINUE;
    }),
);
try {
    loop.run();
} finally {
    signals.forEach((id) => GLib.Source.remove(id));
    stop();
}
