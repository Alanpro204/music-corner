import { LyricsService } from '../src/lyrics/service.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const track = { title: 'Prueba', artist: 'Artista', duration: 180000000 };
const service = new LyricsService();
try {
    let attempts = 0;
    service._fetch = async () => {
        attempts++;
        if (attempts < 3) throw new Error('Fallo temporal');
        return { lines: [{ time: 0, text: 'Recuperada' }] };
    };
    const result = await service.load(track);
    assert(
        attempts === 3 && result.lines[0].text === 'Recuperada',
        'No recupera al tercer intento',
    );
    assert(
        (await service.load(track)) === result && attempts === 3,
        'No conserva la caché tras recuperar',
    );

    service._cache.clear();
    attempts = 0;
    service._fetch = async () => {
        attempts++;
        throw new Error('Sin conexión');
    };
    const failure = await service.load(track);
    assert(
        attempts === 3 && failure.retryable && failure.message,
        'No limita los intentos ni permite reintentar',
    );
    await service.load(track);
    assert(
        attempts === 6,
        'Un reintento manual no inicia tres intentos nuevos',
    );
    service._fetch = async () => {
        attempts++;
        return { message: 'Instrumental' };
    };
    assert(
        (await service.load(track)).message === 'Instrumental' &&
            attempts === 7,
        'Guarda fallos en caché o reintenta éxitos',
    );

    service._cache.clear();
    attempts = 0;
    let rejectPending;
    service._fetch = () => {
        attempts++;
        return new Promise((_resolve, reject) => {
            rejectPending = reject;
        });
    };
    const pending = service.load(track);
    service.cancel();
    rejectPending(new Error('Cancelada'));
    assert(
        (await pending) === null && attempts === 1,
        'Reintenta una petición cancelada',
    );

    let resolveOld;
    service._fetch = () =>
        new Promise((resolve) => {
            resolveOld = resolve;
        });
    const old = service.load(track);
    service._fetch = async () => ({ message: 'Nueva canción' });
    const current = await service.load({ ...track, title: 'Otra canción' });
    resolveOld({ message: 'Respuesta antigua' });
    assert(
        (await old) === null && current.message === 'Nueva canción',
        'Acepta letras de una búsqueda cancelada',
    );
    assert(service._cache.size === 1, 'Guarda en caché una respuesta obsoleta');

    service._fetch = () => {
        throw new Error('No debería buscar sin metadatos');
    };
    assert(
        !(await service.load(null)).retryable,
        'Permite reintentar sin canción',
    );
    print(
        'PASS: letras, tres intentos, recuperación, recarga manual, caché y cancelación',
    );
} finally {
    service.destroy();
}
