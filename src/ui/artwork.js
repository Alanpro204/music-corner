// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Soup from 'gi://Soup?version=3.0';

const MAX_BYTES = 2 * 1024 * 1024;
const ART_SIZE = 76;
const CORNER_RADIUS = 13;

function dominantColor(pixbuf) {
    const pixels = pixbuf.get_pixels();
    const channels = pixbuf.get_n_channels();
    const stride = pixbuf.get_rowstride();
    const groups = Array.from({ length: 12 }, () => ({
        weight: 0,
        r: 0,
        g: 0,
        b: 0,
    }));
    const fallback = { weight: 0, r: 0, g: 0, b: 0 };
    for (let y = 0; y < ART_SIZE; y += 3) {
        for (let x = 0; x < ART_SIZE; x += 3) {
            const offset = y * stride + x * channels;
            if (channels === 4 && pixels[offset + 3] < 128) continue;
            const [r, g, b] = pixels.slice(offset, offset + 3);
            fallback.r += r;
            fallback.g += g;
            fallback.b += b;
            fallback.weight++;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max < 55 || max - min < 35) continue;
            let hue;
            if (max === r) hue = ((g - b) / (max - min) + 6) % 6;
            else if (max === g) hue = (b - r) / (max - min) + 2;
            else hue = (r - g) / (max - min) + 4;
            const group = groups[Math.floor(hue * 2) % groups.length];
            const weight = (max - min) / 255;
            group.weight += weight;
            group.r += r * weight;
            group.g += g * weight;
            group.b += b * weight;
        }
    }
    const best = groups.reduce((a, b) => (b.weight > a.weight ? b : a));
    const result = best.weight ? best : fallback;
    if (!result.weight) return null;
    return `#${['r', 'g', 'b']
        .map((key) =>
            Math.round(result[key] / result.weight)
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;
}

function squareArtwork(data) {
    const loader = new GdkPixbuf.PixbufLoader();
    loader.write(data);
    loader.close();
    const source = loader.get_pixbuf();
    if (!source) throw new Error('Carátula inválida');
    const side = Math.min(source.get_width(), source.get_height());
    if (!side) throw new Error('Carátula vacía');
    const square = source.new_subpixbuf(
        Math.floor((source.get_width() - side) / 2),
        Math.floor((source.get_height() - side) / 2),
        side,
        side,
    );
    const scaled = square.scale_simple(
        ART_SIZE,
        ART_SIZE,
        GdkPixbuf.InterpType.BILINEAR,
    );
    const color = dominantColor(scaled);
    const pixels = scaled.get_pixels();
    const channels = scaled.get_n_channels();
    const stride = scaled.get_rowstride();
    const rounded = new Uint8Array(ART_SIZE * ART_SIZE * 4);
    for (let y = 0; y < ART_SIZE; y++) {
        for (let x = 0; x < ART_SIZE; x++) {
            const input = y * stride + x * channels;
            const output = (y * ART_SIZE + x) * 4;
            rounded.set(pixels.slice(input, input + 3), output);
            const dx = Math.max(
                0,
                CORNER_RADIUS - x - 0.5,
                x + 0.5 - (ART_SIZE - CORNER_RADIUS),
            );
            const dy = Math.max(
                0,
                CORNER_RADIUS - y - 0.5,
                y + 0.5 - (ART_SIZE - CORNER_RADIUS),
            );
            const coverage = Math.max(
                0,
                Math.min(1, CORNER_RADIUS + 0.5 - Math.hypot(dx, dy)),
            );
            rounded[output + 3] = Math.round(
                (channels === 4 ? pixels[input + 3] : 255) * coverage,
            );
        }
    }
    const icon = GdkPixbuf.Pixbuf.new_from_bytes(
        GLib.Bytes.new(rounded),
        GdkPixbuf.Colorspace.RGB,
        true,
        8,
        ART_SIZE,
        ART_SIZE,
        ART_SIZE * 4,
    );
    const [, png] = icon.save_to_bufferv('png', [], []);
    return { png, color };
}

export class Artwork {
    constructor(icon, onColor) {
        this._icon = icon;
        this._onColor = onColor;
        this._session = new Soup.Session({ timeout: 10 });
    }

    async load(url) {
        if (url === this._url) return;
        this._url = url;
        this._cancel?.cancel();
        const cancel = new Gio.Cancellable();
        this._cancel = cancel;
        if (!url) {
            this._clear();
            return;
        }
        let stream;
        let loaded = false;
        try {
            if (url.startsWith('file://')) {
                const file = Gio.File.new_for_uri(url);
                stream = await new Promise((resolve, reject) =>
                    file.read_async(
                        GLib.PRIORITY_DEFAULT,
                        cancel,
                        (source, result) => {
                            try {
                                resolve(source.read_finish(result));
                            } catch (error) {
                                reject(error);
                            }
                        },
                    ),
                );
            } else if (/^https?:\/\//.test(url)) {
                const message = Soup.Message.new('GET', url);
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
                if (
                    message.status_code !== 200 ||
                    message.response_headers.get_content_length() > MAX_BYTES
                )
                    return;
            } else return;
            const chunks = [];
            let size = 0;
            while (!cancel.is_cancelled()) {
                const bytes = await new Promise((resolve, reject) =>
                    stream.read_bytes_async(
                        65536,
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
                if (size > MAX_BYTES) return;
                chunks.push(bytes.toArray());
            }
            if (cancel.is_cancelled() || !size) return;
            const data = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
                data.set(chunk, offset);
                offset += chunk.length;
            }
            const artwork = squareArtwork(data);
            if (cancel.is_cancelled()) return;
            this._icon.gicon = Gio.BytesIcon.new(GLib.Bytes.new(artwork.png));
            this._onColor(artwork.color);
            loaded = true;
        } catch {
            // Missing artwork must never block the controls.
        } finally {
            if (!cancel.is_cancelled() && !loaded) this._clear();
            stream?.close_async(
                GLib.PRIORITY_DEFAULT,
                null,
                (source, result) => {
                    try {
                        source.close_finish(result);
                    } catch {
                        /* Already closed. */
                    }
                },
            );
        }
    }

    _clear() {
        this._icon.gicon = null;
        this._icon.icon_name = 'audio-x-generic-symbolic';
        this._onColor(null);
    }

    destroy() {
        this._cancel?.cancel();
        this._session.abort();
    }
}
