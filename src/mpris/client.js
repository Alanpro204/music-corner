// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
    BUS_PREFIX,
    OBJECT_PATH,
    PLAYER_INTERFACE,
    TRACK_LIST_INTERFACE,
    trackKey,
} from './constants.js';

const ROOT_INTERFACE = 'org.mpris.MediaPlayer2';
const now = () => GLib.get_monotonic_time();

function position(record) {
    const elapsed =
        record.status === 'Playing' ? (now() - record.time) * record.rate : 0;
    return Math.max(0, record.position + elapsed);
}

function call(record, method, args = null, proxy = record.player) {
    return new Promise((resolve, reject) =>
        proxy.call(
            method,
            args,
            Gio.DBusCallFlags.NO_AUTO_START,
            3000,
            record.cancel,
            (proxy, result) => {
                try {
                    resolve(proxy.call_finish(result));
                } catch (error) {
                    reject(error);
                }
            },
        ),
    );
}

function proxyFor(name, iface, cancellable) {
    return new Promise((resolve, reject) => {
        Gio.DBusProxy.new(
            Gio.DBus.session,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START |
                Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES,
            null,
            name,
            OBJECT_PATH,
            iface,
            cancellable,
            (_source, result) => {
                try {
                    resolve(Gio.DBusProxy.new_finish(result));
                } catch (error) {
                    reject(error);
                }
            },
        );
    });
}

function value(proxy, name, fallback) {
    return proxy?.get_cached_property(name)?.recursiveUnpack() ?? fallback;
}

export class MprisClient {
    constructor() {
        this._records = new Map();
        this._listeners = new Set();
        this._cancel = new Gio.Cancellable();
        this._manual = null;
        this._active = null;
        this.error = '';
        this._subscription = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus',
            'org.freedesktop.DBus',
            'NameOwnerChanged',
            '/org/freedesktop/DBus',
            null,
            Gio.DBusSignalFlags.NONE,
            (_bus, _sender, _path, _iface, _signal, args) => {
                const [name, oldOwner, newOwner] = args.deepUnpack();
                if (!name.startsWith(BUS_PREFIX)) return;
                if (oldOwner) this._remove(name);
                if (newOwner) this._add(name);
            },
        );
        Gio.DBus.session.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE,
            3000,
            this._cancel,
            (bus, result) => {
                try {
                    const [names] = bus.call_finish(result).deepUnpack();
                    if (this._destroyed) return;
                    names
                        .filter((name) => name.startsWith(BUS_PREFIX))
                        .forEach((name) => this._add(name));
                } catch (error) {
                    if (!this._destroyed) {
                        this.error = `No se pudo consultar MPRIS: ${error.message}`;
                        this._emit();
                    }
                }
            },
        );
    }

    subscribe(callback) {
        this._listeners.add(callback);
        callback(this.snapshot);
        return () => this._listeners.delete(callback);
    }

    get snapshot() {
        const players = [...this._records.values()]
            .filter((record) => record.player)
            .map((record) => {
                const metadata = value(record.player, 'Metadata', {});
                return {
                    name: record.name,
                    identity: value(
                        record.root,
                        'Identity',
                        record.name.slice(BUS_PREFIX.length),
                    ),
                    status: value(record.player, 'PlaybackStatus', 'Stopped'),
                    title: metadata['xesam:title'] || 'Sin título',
                    artist:
                        (metadata['xesam:artist'] ?? []).join(', ') ||
                        'Artista desconocido',
                    artUrl: metadata['mpris:artUrl'] || '',
                    album: metadata['xesam:album'] || '',
                    trackId: record.trackId,
                    duration: Math.max(0, metadata['mpris:length'] || 0),
                    position: position(record),
                    canRaise: value(record.root, 'CanRaise', false),
                    canSeek: value(record.player, 'CanSeek', false),
                    canControl: value(record.player, 'CanControl', false),
                    canPlay: value(record.player, 'CanPlay', false),
                    canPause: value(record.player, 'CanPause', false),
                    canNext: value(record.player, 'CanGoNext', false),
                    canPrevious: value(record.player, 'CanGoPrevious', false),
                    trackList: {
                        supported: !!record.trackList,
                        loading: record.trackList?.loading ?? false,
                        error: record.trackList?.error ?? '',
                        tracks: record.trackList?.tracks ?? [],
                    },
                };
            })
            .sort((a, b) => a.identity.localeCompare(b.identity));
        const previous = players.find((player) => player.name === this._active);
        const selected =
            players.find((player) => player.name === this._manual) ??
            (previous?.status === 'Playing' ? previous : null) ??
            players.find((player) => player.status === 'Playing') ??
            previous ??
            players[0] ??
            null;
        this._active = selected?.name ?? null;
        return { players, selected, error: this.error };
    }

    select(name) {
        this._manual = name;
        this.error = '';
        this._emit();
    }

    async _add(name) {
        if (this._destroyed || this._records.has(name)) return;
        const record = { name, cancel: new Gio.Cancellable(), signals: [] };
        this._records.set(name, record);
        try {
            const player = await proxyFor(
                name,
                PLAYER_INTERFACE,
                record.cancel,
            );
            if (this._records.get(name) !== record) return;
            if (!player.g_name_owner) {
                this._remove(name);
                return;
            }
            record.player = player;
            record.position = Math.max(0, value(player, 'Position', 0));
            record.time = now();
            record.status = value(player, 'PlaybackStatus', 'Stopped');
            record.rate = value(player, 'Rate', 1);
            record.trackId = value(player, 'Metadata', {})['mpris:trackid'];
            record.revision = 0;
            record.signals.push(
                [
                    player,
                    player.connect(
                        'g-properties-changed',
                        (_proxy, changed, invalidated) => {
                            const keys = [
                                ...Object.keys(changed.deepUnpack()),
                                ...invalidated,
                            ];
                            if (
                                keys.some((key) =>
                                    [
                                        'Metadata',
                                        'PlaybackStatus',
                                        'Rate',
                                        'Position',
                                    ].includes(key),
                                )
                            ) {
                                const trackId = value(player, 'Metadata', {})[
                                    'mpris:trackid'
                                ];
                                record.position =
                                    trackId !== record.trackId
                                        ? 0
                                        : position(record);
                                if (keys.includes('Position'))
                                    record.position = value(
                                        player,
                                        'Position',
                                        record.position,
                                    );
                                record.time = now();
                                record.trackId = trackId;
                                record.status = value(
                                    player,
                                    'PlaybackStatus',
                                    'Stopped',
                                );
                                record.rate = value(player, 'Rate', 1);
                                record.revision++;
                                this.refreshPosition(name);
                            }
                            this._emit();
                        },
                    ),
                ],
                [
                    player,
                    player.connect(
                        'g-signal',
                        (_proxy, _sender, signal, args) => {
                            if (signal !== 'Seeked') return;
                            record.position = Math.max(0, args.deepUnpack()[0]);
                            record.time = now();
                            record.revision++;
                            this._emit();
                        },
                    ),
                ],
            );
            this._emit();
            const root = await proxyFor(name, ROOT_INTERFACE, record.cancel);
            if (this._records.get(name) !== record) return;
            record.root = root;
            record.signals.push([
                root,
                root.connect('g-properties-changed', () => {
                    this._syncTrackList(record);
                    this._emit();
                }),
            ]);
            this._syncTrackList(record);
            this._emit();
        } catch {
            if (!record.cancel.is_cancelled() && !record.player)
                this._remove(name);
            // A player may disappear during discovery or omit its root interface.
        }
    }

    async _syncTrackList(record) {
        if (!value(record.root, 'HasTrackList', false)) {
            const list = record.trackList;
            list?.signals.forEach(([proxy, id]) => proxy.disconnect(id));
            record.trackList = null;
            return;
        }
        if (record.trackList) return;
        const list = {
            tracks: [],
            ids: [],
            signals: [],
            revision: 0,
            loading: true,
            error: '',
        };
        record.trackList = list;
        this._emit();
        try {
            const proxy = await proxyFor(
                record.name,
                TRACK_LIST_INTERFACE,
                record.cancel,
            );
            if (!this._listIsCurrent(record, list)) return;
            if (!proxy.get_cached_property('Tracks'))
                throw new Error('TrackList no publica Tracks');
            list.proxy = proxy;
            list.ids = value(proxy, 'Tracks', []);
            list.signals.push([
                proxy,
                proxy.connect('g-properties-changed', (_proxy, changed) => {
                    if (!('Tracks' in changed.deepUnpack())) return;
                    list.ids = value(proxy, 'Tracks', []);
                    this._loadTracks(record, list);
                }),
            ]);
            list.signals.push([
                proxy,
                proxy.connect('g-signal', (_proxy, _sender, signal, args) => {
                    const data = args.recursiveUnpack();
                    if (signal === 'TrackListReplaced') list.ids = data[0];
                    else if (signal === 'TrackAdded') {
                        const id = data[0]['mpris:trackid'];
                        if (!id || list.ids.includes(id)) return;
                        list.ids.splice(list.ids.indexOf(data[1]) + 1, 0, id);
                    } else if (signal === 'TrackRemoved')
                        list.ids = list.ids.filter((id) => id !== data[0]);
                    else if (signal === 'TrackMetadataChanged')
                        list.ids = list.ids.map((id) =>
                            id === data[0] ? data[1]['mpris:trackid'] : id,
                        );
                    else return;
                    this._loadTracks(record, list);
                }),
            ]);
            await this._loadTracks(record, list);
        } catch {
            if (!this._listIsCurrent(record, list)) return;
            list.loading = false;
            list.error =
                'No se pudo cargar la lista. Cierra y vuelve a abrir Canciones para reintentar.';
            this._emit();
        }
    }

    _listIsCurrent(record, list) {
        return (
            !this._destroyed &&
            this._records.get(record.name) === record &&
            record.trackList === list
        );
    }

    async _loadTracks(record, list) {
        const revision = ++list.revision;
        const ids = [...list.ids];
        list.loading = true;
        list.error = '';
        // Drop removed rows immediately, including while metadata is loading.
        list.tracks = list.tracks.filter((track) => ids.includes(track.id));
        this._emit();
        try {
            const metadata = new Map();
            for (let offset = 0; offset < ids.length; offset += 100) {
                const result = await call(
                    record,
                    'GetTracksMetadata',
                    new GLib.Variant('(ao)', [ids.slice(offset, offset + 100)]),
                    list.proxy,
                );
                if (
                    !this._listIsCurrent(record, list) ||
                    revision !== list.revision
                )
                    return;
                for (const item of result.recursiveUnpack()[0])
                    metadata.set(item['mpris:trackid'], item);
            }
            list.tracks = ids.map((id) => {
                const item = metadata.get(id) ?? {};
                return {
                    id,
                    title: item['xesam:title'] || 'Sin título',
                    artist:
                        (item['xesam:artist'] ?? []).join(', ') ||
                        'Artista desconocido',
                };
            });
        } catch {
            if (
                !this._listIsCurrent(record, list) ||
                revision !== list.revision
            )
                return;
            list.error =
                'No se pudo cargar la lista. Cierra y vuelve a abrir Canciones para reintentar.';
        }
        list.loading = false;
        this._emit();
    }

    refreshTracks() {
        const record = this._records.get(this.snapshot.selected?.name);
        if (!record?.trackList || record.trackList.loading) return;
        if (!record.trackList.proxy) {
            record.trackList = null;
            this._syncTrackList(record);
        } else this._loadTracks(record, record.trackList);
    }

    async goToTrack(id, playerName) {
        const selected = this.snapshot.selected;
        const record = this._records.get(playerName);
        const list = record?.trackList;
        if (
            selected?.name !== playerName ||
            !selected?.canControl ||
            !list?.proxy ||
            !list.ids.includes(id)
        )
            return false;
        try {
            await call(
                record,
                'GoTo',
                new GLib.Variant('(o)', [id]),
                list.proxy,
            );
            if (!this._listIsCurrent(record, list)) return false;
            this.error = '';
            this._emit();
            return true;
        } catch (error) {
            if (this._listIsCurrent(record, list)) {
                this.error =
                    'No se pudo cambiar de canción. Vuelve a intentarlo.';
                console.warn(`Music Corner: ${error.message}`);
                this._emit();
            }
            return false;
        }
    }

    _remove(name) {
        const record = this._records.get(name);
        if (!record) return;
        record.cancel.cancel();
        record.trackList?.signals.forEach(([proxy, id]) =>
            proxy.disconnect(id),
        );
        record.signals.forEach(([proxy, id]) => proxy.disconnect(id));
        this._records.delete(name);
        if (this._manual === name) this._manual = null;
        this._emit();
    }

    async raise() {
        const selected = this.snapshot.selected;
        const record = this._records.get(selected?.name);
        if (!selected?.canRaise || !record?.root) return false;
        try {
            await call(record, 'Raise', null, record.root);
            if (this._destroyed || this._records.get(record.name) !== record)
                return false;
            this.error = '';
            this._emit();
            return true;
        } catch (error) {
            if (!this._destroyed && this._records.get(record.name) === record) {
                this.error =
                    'No se pudo abrir el reproductor. Vuelve a intentarlo.';
                console.warn(`Music Corner: ${error.message}`);
                this._emit();
            }
            return false;
        }
    }

    async command(action) {
        const selected = this.snapshot.selected;
        if (!selected?.canControl) return false;
        const allowed = {
            Previous: selected.canPrevious,
            Next: selected.canNext,
            PlayPause:
                selected.status === 'Playing'
                    ? selected.canPause
                    : selected.canPlay,
        };
        if (!allowed[action]) return false;
        const record = this._records.get(selected.name);
        // Play works for stopped players that support starting but not pausing.
        const method =
            action === 'PlayPause' && selected.status !== 'Playing'
                ? 'Play'
                : action;
        try {
            await call(record, method);
            if (!this._destroyed) {
                this.error = '';
                this._emit();
            }
            return true;
        } catch (error) {
            if (!this._destroyed && !record.cancel.is_cancelled()) {
                this.error =
                    'El reproductor no respondió. Vuelve a intentarlo.';
                console.warn(`Music Corner: ${error.message}`);
                this._emit();
            }
            return false;
        }
    }

    async refreshPosition(name = this.snapshot.selected?.name) {
        const record = this._records.get(name);
        if (!record?.player) return;
        const revision = ++record.revision;
        try {
            const result = await call(
                record,
                'org.freedesktop.DBus.Properties.Get',
                new GLib.Variant('(ss)', [PLAYER_INTERFACE, 'Position']),
            );
            if (
                this._records.get(name) !== record ||
                revision !== record.revision
            )
                return;
            record.position = Math.max(0, result.recursiveUnpack()[0]);
            record.time = now();
            this._emit();
        } catch {
            // Position is optional in practice; keep the local clock if unavailable.
        }
    }

    async seek(target, expected) {
        const selected = this.snapshot.selected;
        if (
            !Number.isFinite(target) ||
            !selected?.canControl ||
            !selected.canSeek ||
            selected.duration <= 0 ||
            selected.trackId === '/org/mpris/MediaPlayer2/TrackList/NoTrack' ||
            trackKey(selected) !== trackKey(expected)
        )
            return false;
        const record = this._records.get(selected.name);
        try {
            const position = Math.round(
                Math.min(selected.duration, Math.max(0, target)),
            );
            if (selected.trackId) {
                await call(
                    record,
                    'SetPosition',
                    new GLib.Variant('(ox)', [selected.trackId, position]),
                );
            } else {
                // Seek is relative, so refresh the playback clock before calculating
                // the offset. Recheck the song after that asynchronous read.
                await this.refreshPosition(selected.name);
                const current = this.snapshot.selected;
                if (
                    trackKey(current) !== trackKey(expected) ||
                    !current.canSeek ||
                    !current.canControl
                )
                    return false;
                await call(
                    record,
                    'Seek',
                    new GLib.Variant('(x)', [
                        Math.round(position - current.position),
                    ]),
                );
            }
            if (trackKey(this.snapshot.selected) !== trackKey(selected))
                return false;
            await this.refreshPosition(selected.name);
            if (!this._destroyed) {
                this.error = '';
                this._emit();
            }
            return true;
        } catch (error) {
            if (!this._destroyed && !record.cancel.is_cancelled()) {
                this.error = 'No se pudo cambiar la posición de la canción.';
                console.warn(`Music Corner: ${error.message}`);
                this._emit();
            }
            return false;
        }
    }

    _emit() {
        if (this._destroyed) return;
        const snapshot = this.snapshot;
        this._listeners.forEach((callback) => callback(snapshot));
    }

    destroy() {
        this._destroyed = true;
        this._cancel.cancel();
        Gio.DBus.session.signal_unsubscribe(this._subscription);
        [...this._records.keys()].forEach((name) => this._remove(name));
        this._listeners.clear();
    }
}
