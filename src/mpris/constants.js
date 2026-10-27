// SPDX-License-Identifier: GPL-2.0-or-later
export const BUS_PREFIX = 'org.mpris.MediaPlayer2.';
export const OBJECT_PATH = '/org/mpris/MediaPlayer2';
export const PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';

// Some players (including G4Music) omit mpris:trackid. Use metadata to
// invalidate gestures when their song changes, rather than disabling seeking.
export function trackKey(track) {
    return JSON.stringify([
        track?.name,
        track?.trackId,
        track?.title,
        track?.artist,
        track?.album,
        track?.duration,
    ]);
}
