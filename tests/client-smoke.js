import GLib from 'gi://GLib';
import { MprisClient } from '../src/mpris/client.js';
import { startMockPlayer, MOCK_BUS_NAME } from '../tools/mock-player.js';

const wait = (ms) =>
    new Promise((resolve) =>
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }),
    );
async function until(predicate, message) {
    for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await wait(30);
    }
    throw new Error(message);
}
function assert(condition, message) {
    if (!condition) throw new Error(message);
}
const first = startMockPlayer({ status: 'Paused' });
const client = new MprisClient();
let second;
let withoutId;
try {
    await until(
        () =>
            client.snapshot.selected?.identity ===
            'Music Corner Mock (sin audio)',
        'No descubre el reproductor inicial',
    );
    const initial = client.snapshot.selected;
    assert(
        initial.duration === 180000000 && initial.canSeek,
        'No lee duración/capacidad',
    );
    assert(await client.seek(60000000, initial), 'No ejecuta SetPosition');
    assert(
        Math.abs(client.snapshot.selected.position - 60000000) < 100000,
        'No actualiza posición tras Seeked',
    );
    await wait(150);
    assert(
        Math.abs(client.snapshot.selected.position - 60000000) < 100000,
        'El reloj avanza en pausa',
    );
    first.update({ Position: 30000000 });
    await until(
        () => Math.abs(client.snapshot.selected.position - 30000000) < 100000,
        'Ignora salto externo',
    );
    first.update({ CanSeek: false });
    await until(
        () => !client.snapshot.selected.canSeek,
        'No actualiza CanSeek',
    );
    assert(!(await client.seek(90000000, initial)), 'Ignora CanSeek');
    first.update({ CanSeek: true });
    await until(() => client.snapshot.selected.canSeek, 'No restaura CanSeek');
    assert(await client.command('PlayPause'), 'No ejecuta Play');
    await until(
        () => client.snapshot.selected.status === 'Playing',
        'No recibe PlaybackStatus',
    );
    const before = client.snapshot.selected.position;
    await wait(150);
    assert(
        client.snapshot.selected.position > before + 100000,
        'El reloj no avanza reproduciendo',
    );
    first.update({ Rate: 2 });
    await wait(100);
    const fast = client.snapshot.selected.position;
    await wait(150);
    assert(client.snapshot.selected.position > fast + 250000, 'Ignora Rate');
    await client.command('Next');
    await until(
        () => client.snapshot.selected.title === 'Segunda canción',
        'No recibe Metadata',
    );
    assert(
        client.snapshot.selected.position < 1000000,
        'No reinicia al cambiar de pista',
    );
    assert(
        !(await client.seek(90000000, initial)),
        'Permite salto a una pista obsoleta',
    );
    await client.command('PlayPause');
    await client.seek(-1000000, client.snapshot.selected);
    assert(
        client.snapshot.selected.position === 0,
        'No limita posición negativa',
    );
    await client.seek(999000000, client.snapshot.selected);
    assert(
        client.snapshot.selected.position === 180000000,
        'No limita posición a duración',
    );
    first.update({ CanGoNext: false });
    await until(
        () => !client.snapshot.selected.canNext,
        'No actualiza capacidades',
    );
    assert((await client.command('Next')) === false, 'Ignora CanGoNext');
    first.update({ PlaybackStatus: 'Paused' });
    const other = 'org.mpris.MediaPlayer2.SecondMock';
    second = startMockPlayer({
        name: other,
        identity: 'Segundo reproductor',
        duration: 0,
    });
    await until(
        () => client.snapshot.selected?.name === other,
        'No prioriza el reproductor en reproducción',
    );
    assert(
        !(await client.seek(1000000, client.snapshot.selected)),
        'Permite buscar sin duración',
    );
    client.select(MOCK_BUS_NAME);
    assert(
        client.snapshot.selected.name === MOCK_BUS_NAME,
        'No respeta selección manual',
    );
    first();
    await until(
        () =>
            client.snapshot.players.length === 1 &&
            client.snapshot.selected.name === other,
        'No recupera selección al cerrar un reproductor',
    );
    second();
    await until(
        () => client.snapshot.players.length === 0,
        'No muestra estado vacío',
    );
    withoutId = startMockPlayer({ status: 'Paused', omitTrackId: true });
    await until(
        () => client.snapshot.selected?.name === MOCK_BUS_NAME,
        'No descubre reproductor sin identificador',
    );
    const missingId = client.snapshot.selected;
    assert(
        !missingId.trackId && missingId.canSeek,
        'El simulador no omite trackid',
    );
    assert(
        await client.seek(90000000, missingId),
        'No busca sin identificador de pista',
    );
    assert(
        Math.abs(client.snapshot.selected.position - 90000000) < 100000,
        'Seek no salta al punto solicitado',
    );
    assert(
        await client.seek(30000000, client.snapshot.selected),
        'No retrocede con Seek',
    );
    assert(
        Math.abs(client.snapshot.selected.position - 30000000) < 100000,
        'Seek no retrocede a la posición solicitada',
    );
    await client.command('Next');
    await until(
        () => client.snapshot.selected.title === 'Segunda canción',
        'No cambia pista sin identificador',
    );
    assert(
        !(await client.seek(120000000, missingId)),
        'Busca una canción obsoleta sin identificador',
    );
    await client.seek(-1000000, client.snapshot.selected);
    assert(client.snapshot.selected.position === 0, 'Seek no limita el inicio');
    await client.seek(999000000, client.snapshot.selected);
    assert(
        client.snapshot.selected.position === 180000000,
        'Seek no limita el final',
    );
    withoutId.update({ CanSeek: false });
    await until(() => !client.snapshot.selected.canSeek, 'No desactiva Seek');
    assert(
        !(await client.seek(60000000, client.snapshot.selected)),
        'Busca sin CanSeek y sin identificador',
    );
    withoutId();
    const transient = new MprisClient();
    transient.destroy();
    await wait(100);
    print(
        'PASS: cliente MPRIS, descubrimiento, acciones, capacidades, selección y cierre',
    );
} finally {
    client.destroy();
    first();
    second?.();
    withoutId?.();
}
