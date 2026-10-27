// SPDX-License-Identifier: GPL-2.0-or-later
// LRC timestamps are seconds; MPRIS positions are microseconds.
export function parseLrc(source) {
    const entries = [];
    // Positive LRC offset makes lyrics appear earlier.
    const offset =
        Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
    for (const line of source.split(/\r?\n/)) {
        const stamps = [
            ...line.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g),
        ];
        const text = line.replace(/\[[^\]]*\]/g, '').trim();
        for (const stamp of stamps) {
            if (Number(stamp[2]) >= 60) continue;
            entries.push({
                time: Math.max(
                    0,
                    Number(stamp[1]) * 60 +
                        Number(stamp[2]) +
                        Number(`0.${stamp[3] ?? '0'}`) -
                        offset,
                ),
                text: text || '♪',
            });
        }
    }
    entries.sort((a, b) => a.time - b.time);
    // Translations and duet lines with identical timestamps stay together.
    return entries.reduce((lines, entry) => {
        const previous = lines.at(-1);
        if (previous?.time === entry.time) previous.text += `\n${entry.text}`;
        else lines.push(entry);
        return lines;
    }, []);
}

export function activeLine(lines, seconds) {
    let low = 0;
    let high = lines.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (lines[middle].time <= seconds) low = middle + 1;
        else high = middle;
    }
    return low - 1;
}
