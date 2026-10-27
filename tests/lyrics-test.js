import { parseLrc, activeLine } from '../src/lyrics/lrc.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
const lines = parseLrc(
    '[ar:Example]\n[offset:+500]\n[00:02.25][00:10.250]Repeated\n[00:00.00]\n[00:02.25]Translation\n[00:99]Invalid',
);
assert(lines.length === 3, 'Multiple stamps or invalid seconds');
assert(lines[0].time === 0 && lines[0].text === '♪', 'Instrumental interval');
assert(
    lines[1].time === 1.75 && lines[1].text === 'Repeated\nTranslation',
    'Offset, fraction and simultaneous lines',
);
assert(activeLine(lines, -1) === -1, 'Before first timestamp');
assert(activeLine(lines, 1.74) === 0, 'Before boundary');
assert(activeLine(lines, 1.75) === 1, 'Exact boundary');
assert(activeLine(lines, 100) === 2, 'After last timestamp');
assert(activeLine(lines, 0) === 0, 'Seek backwards');
assert(
    activeLine([], 2) === -1 && parseLrc('plain text').length === 0,
    'Unsynced lyrics',
);
assert(
    parseLrc('[offset:-500]\n[00:02.25]Later')[0].time === 2.75,
    'Negative offset delays lyrics',
);
console.log('PASS: LRC timestamps, offsets, repeats, translations and seeking');
