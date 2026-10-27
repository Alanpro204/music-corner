// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import { parseLrc } from './lrc.js';

const MAX_BYTES = 512 * 1024;
export function lyricsKey(track) {
    return JSON.stringify([
        track?.title,
        track?.artist,
        track?.album,
        track?.duration,
    ]);
}

export class LyricsService {
    constructor() {
        this._session = new Soup.Session({ timeout: 12 });
        this._cache = new Map();
    }

    cancel() {
        this._cancel?.cancel();
    }

    async load(track) {
        this.cancel();
        const key = lyricsKey(track);
        if (this._cache.has(key)) return this._cache.get(key);
        if (
            !track ||
            track.title === 'Sin título' ||
            track.artist === 'Artista desconocido'
        )
            return {
                message:
                    'Faltan el título o el artista para buscar las letras.',
            };
        const cancel = new Gio.Cancellable();
        this._cancel = cancel;
        const params = { track_name: track.title, artist_name: track.artist };
        if (track.album) params.album_name = track.album;
        if (track.duration > 0)
            params.duration = Math.round(track.duration / 1000000);
        const query = Object.entries(params)
            .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
            .join('&');
        const message = Soup.Message.new(
            'GET',
            `https://lrclib.net/api/get?${query}`,
        );
        message.request_headers.append(
            'User-Agent',
            'MusicCorner/0.2 (GNOME Shell)',
        );
        let stream;
        try {
            stream = await new Promise((resolve, reject) =>
                this._session.send_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    cancel,
                    (session, result) => {
                        try {
                            resolve(session.send_finish(result));
                        } catch (error) {
                            reject(error);
                        }
                    },
                ),
            );
            if (message.status_code === 404) {
                const result = {
                    message: 'No hay letras disponibles para esta canción.',
                };
                this._remember(key, result);
                return result;
            }
            if (
                message.status_code !== 200 ||
                message.response_headers.get_content_length() > MAX_BYTES
            )
                throw new Error('Respuesta de letras inválida');
            const chunks = [];
            let size = 0;
            while (true) {
                const bytes = await new Promise((resolve, reject) =>
                    stream.read_bytes_async(
                        16384,
                        GLib.PRIORITY_DEFAULT,
                        cancel,
                        (source, result) => {
                            try {
                                resolve(source.read_bytes_finish(result));
                            } catch (error) {
                                reject(error);
                            }
                        },
                    ),
                );
                if (!bytes.get_size()) break;
                size += bytes.get_size();
                if (size > MAX_BYTES)
                    throw new Error('Letras demasiado grandes');
                chunks.push(bytes.toArray());
            }
            if (cancel.is_cancelled()) return null;
            const data = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
                data.set(chunk, offset);
                offset += chunk.length;
            }
            const record = JSON.parse(new TextDecoder().decode(data));
            const lines = parseLrc(
                typeof record.syncedLyrics === 'string'
                    ? record.syncedLyrics
                    : '',
            );
            const result = record.instrumental
                ? { message: 'Instrumental · disfruta de la música' }
                : {
                      lines,
                      plain:
                          typeof record.plainLyrics === 'string'
                              ? record.plainLyrics
                              : '',
                      message: lines.length
                          ? ''
                          : 'No hay letras sincronizadas para esta canción.',
                  };
            this._remember(key, result);
            return result;
        } catch {
            return cancel.is_cancelled()
                ? null
                : {
                      message:
                          'No se pudieron cargar las letras. Vuelve a intentarlo.',
                  };
        } finally {
            stream?.close_async(
                GLib.PRIORITY_DEFAULT,
                null,
                (source, result) => {
                    try {
                        source.close_finish(result);
                    } catch {
                        /* Cancelled stream. */
                    }
                },
            );
        }
    }

    _remember(key, result) {
        if (this._cache.size >= 32)
            this._cache.delete(this._cache.keys().next().value);
        this._cache.set(key, result);
    }

    destroy() {
        this.cancel();
        this._session.abort();
        this._cache.clear();
    }
}
