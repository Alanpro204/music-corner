import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    BUS_PREFIX,
    OBJECT_PATH,
    PLAYER_INTERFACE,
    TRACK_LIST_INTERFACE,
} from '../src/mpris/constants.js';

const XML = `<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/><method name="Quit"/>
    <property name="CanQuit" type="b" access="read"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="HasTrackList" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="SupportedUriSchemes" type="as" access="read"/>
    <property name="SupportedMimeTypes" type="as" access="read"/>
  </interface>
  <interface name="${PLAYER_INTERFACE}">
    <method name="PlayPause"/><method name="Play"/><method name="Pause"/>
    <method name="Stop"/><method name="Next"/><method name="Previous"/>
    <method name="Seek"><arg type="x" direction="in"/></method>
    <method name="SetPosition"><arg type="o" direction="in"/><arg type="x" direction="in"/></method>
    <method name="OpenUri"><arg type="s" direction="in"/></method>
    <signal name="Seeked"><arg type="x"/></signal>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Rate" type="d" access="readwrite"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Volume" type="d" access="readwrite"/>
    <property name="Position" type="x" access="read"/>
    <property name="MinimumRate" type="d" access="read"/>
    <property name="MaximumRate" type="d" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="CanControl" type="b" access="read"/>
  </interface>
  <interface name="${TRACK_LIST_INTERFACE}">
    <method name="GetTracksMetadata"><arg type="ao" direction="in"/><arg type="aa{sv}" direction="out"/></method>
    <method name="GoTo"><arg type="o" direction="in"/></method>
    <property name="Tracks" type="ao" access="read"/>
    <property name="CanEditTracks" type="b" access="read"/>
    <signal name="TrackListReplaced"><arg type="ao"/><arg type="o"/></signal>
    <signal name="TrackAdded"><arg type="a{sv}"/><arg type="o"/></signal>
    <signal name="TrackRemoved"><arg type="o"/></signal>
    <signal name="TrackMetadataChanged"><arg type="o"/><arg type="a{sv}"/></signal>
  </interface>
</node>`;

export const MOCK_BUS_NAME = `${BUS_PREFIX}MusicCompanionMock`;

export function startMockPlayer(options = {}) {
    const connection = Gio.DBusConnection.new_for_address_sync(
        GLib.getenv('DBUS_SESSION_BUS_ADDRESS'),
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT |
            Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        null,
        null,
    );
    const name = options.name ?? MOCK_BUS_NAME;
    let index = 0;
    const tracks = options.tracks ?? [
        'Canción de prueba',
        'Segunda canción',
        'Última canción',
    ];
    let trackIds = tracks.map((_title, i) => `/mock/track/${i}`);
    const trackMetadata = (id) => ({
        'mpris:trackid': new GLib.Variant('o', id),
        'xesam:title': new GLib.Variant(
            's',
            tracks[Number(id.split('/').pop())] ?? 'Nueva canción',
        ),
        'xesam:artist': new GLib.Variant('as', ['Music Corner']),
    });
    let basePosition = options.position ?? 0;
    let baseTime = GLib.get_monotonic_time();
    const state = {
        PlaybackStatus: options.status ?? 'Playing',
        Rate: 1.0,
        Volume: 0.5,
        get Position() {
            return Math.round(
                Math.min(
                    options.duration ?? 180000000,
                    Math.max(
                        0,
                        basePosition +
                            (this.PlaybackStatus === 'Playing'
                                ? (GLib.get_monotonic_time() - baseTime) *
                                  this.Rate
                                : 0),
                    ),
                ),
            );
        },
        MinimumRate: 1.0,
        MaximumRate: 1.0,
        CanGoNext: true,
        CanGoPrevious: true,
        CanPlay: true,
        CanPause: true,
        CanSeek: true,
        CanControl: true,
        get Metadata() {
            return {
                ...(options.omitTrackId
                    ? {}
                    : {
                          'mpris:trackid': new GLib.Variant(
                              'o',
                              `/mock/track/${index}`,
                          ),
                      }),
                'mpris:length': new GLib.Variant(
                    'x',
                    options.duration ?? 180000000,
                ),
                'mpris:artUrl': new GLib.Variant('s', options.artUrl ?? ''),
                'xesam:title': new GLib.Variant('s', tracks[index]),
                'xesam:artist': new GLib.Variant('as', ['Music Corner']),
            };
        },
        PlayPause() {
            setStatus(this.PlaybackStatus === 'Playing' ? 'Paused' : 'Playing');
        },
        Play() {
            setStatus('Playing');
        },
        Pause() {
            setStatus('Paused');
        },
        Stop() {
            setStatus('Stopped');
        },
        Next() {
            changeTrack(1);
        },
        Previous() {
            changeTrack(-1);
        },
        Seek(offset) {
            this.SetPosition(`/mock/track/${index}`, this.Position + offset);
        },
        SetPosition(trackId, position) {
            if (
                !this.CanSeek ||
                !this.CanControl ||
                trackId !== `/mock/track/${index}` ||
                position < 0 ||
                position > (options.duration ?? 180000000)
            )
                return;
            basePosition = position;
            baseTime = GLib.get_monotonic_time();
            exportedPlayer.emit_signal(
                'Seeked',
                new GLib.Variant('(x)', [position]),
            );
        },
        OpenUri() {},
    };
    function setStatus(status) {
        basePosition = state.Position;
        baseTime = GLib.get_monotonic_time();
        state.PlaybackStatus = status;
        exportedPlayer.emit_property_changed(
            'PlaybackStatus',
            new GLib.Variant('s', status),
        );
    }
    function changeTrack(direction) {
        index = (index + direction + tracks.length) % tracks.length;
        basePosition = 0;
        baseTime = GLib.get_monotonic_time();
        exportedPlayer.emit_property_changed(
            'Metadata',
            new GLib.Variant('a{sv}', state.Metadata),
        );
    }
    const node = Gio.DBusNodeInfo.new_for_xml(XML);
    let raiseCount = 0;
    const rootState = {
        CanQuit: false,
        CanRaise: options.canRaise ?? false,
        HasTrackList: options.trackList !== false,
        Identity: options.identity ?? 'Music Corner Mock (sin audio)',
        SupportedUriSchemes: [],
        SupportedMimeTypes: [],
        Raise() {
            raiseCount++;
            options.onRaise?.();
        },
        Quit() {},
    };
    const root = Gio.DBusExportedObject.wrapJSObject(
        node.interfaces[0],
        rootState,
    );
    const exportedPlayer = Gio.DBusExportedObject.wrapJSObject(
        node.interfaces[1],
        state,
    );
    const exportedTracks = Gio.DBusExportedObject.wrapJSObject(
        node.interfaces[2],
        {
            get Tracks() {
                return trackIds;
            },
            CanEditTracks: false,
            GetTracksMetadata(ids) {
                if (options.metadataError)
                    throw new Error('Metadata unavailable');
                return ids.map(trackMetadata);
            },
            GoTo(id) {
                if (!state.CanControl || !trackIds.includes(id)) return;
                changeTrack(Number(id.split('/').pop()) - index);
            },
        },
    );
    root.export(connection, OBJECT_PATH);
    exportedPlayer.export(connection, OBJECT_PATH);
    if (options.trackList !== false)
        exportedTracks.export(connection, OBJECT_PATH);
    const owner = Gio.bus_own_name_on_connection(
        connection,
        name,
        Gio.BusNameOwnerFlags.NONE,
        () => print(`MPRIS mock listo: ${MOCK_BUS_NAME}`),
        () =>
            printerr('No se pudo mantener el nombre del reproductor simulado.'),
    );
    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        Gio.bus_unown_name(owner);
        root.unexport();
        exportedPlayer.unexport();
        if (options.trackList !== false) exportedTracks.unexport();
        connection.close_sync(null);
    };
    stop.getRaiseCount = () => raiseCount;
    stop.updateRoot = (properties) => {
        for (const [key, value] of Object.entries(properties)) {
            rootState[key] = value;
            root.emit_property_changed(
                key,
                new GLib.Variant(typeof value === 'boolean' ? 'b' : 's', value),
            );
        }
    };
    stop.update = (properties) => {
        for (const [key, value] of Object.entries(properties)) {
            if (key === 'Position') {
                state.SetPosition(`/mock/track/${index}`, value);
                continue;
            }
            if (key === 'PlaybackStatus') {
                setStatus(value);
                continue;
            }
            if (key === 'Rate') {
                basePosition = state.Position;
                baseTime = GLib.get_monotonic_time();
            }
            state[key] = value;
            exportedPlayer.emit_property_changed(
                key,
                new GLib.Variant(
                    typeof value === 'boolean'
                        ? 'b'
                        : typeof value === 'number'
                          ? 'd'
                          : 's',
                    value,
                ),
            );
        }
    };
    stop.setArtUrl = (url) => {
        options.artUrl = url;
        exportedPlayer.emit_property_changed(
            'Metadata',
            new GLib.Variant('a{sv}', state.Metadata),
        );
    };
    stop.replaceTracks = (ids) => {
        trackIds = ids;
        exportedTracks.emit_signal(
            'TrackListReplaced',
            new GLib.Variant('(aoo)', [ids, `/mock/track/${index}`]),
        );
    };
    stop.addTrack = (id, after) => {
        trackIds.splice(trackIds.indexOf(after) + 1, 0, id);
        exportedTracks.emit_signal(
            'TrackAdded',
            new GLib.Variant('(a{sv}o)', [trackMetadata(id), after]),
        );
    };
    stop.removeTrack = (id) => {
        trackIds = trackIds.filter((track) => track !== id);
        exportedTracks.emit_signal(
            'TrackRemoved',
            new GLib.Variant('(o)', [id]),
        );
    };
    stop.renameTrack = (id, title) => {
        tracks[Number(id.split('/').pop())] = title;
        exportedTracks.emit_signal(
            'TrackMetadataChanged',
            new GLib.Variant('(oa{sv})', [id, trackMetadata(id)]),
        );
    };
    stop.setMetadataError = (enabled) => {
        options.metadataError = enabled;
    };
    return stop;
}
