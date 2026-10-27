// SPDX-License-Identifier: GPL-2.0-or-later
export const COLORS = [
    { key: 'background-color', title: 'Fondo del menú', fallback: '#171c26' },
    { key: 'text-color', title: 'Texto e iconos', fallback: '#f3f5fa' },
    { key: 'muted-color', title: 'Texto secundario', fallback: '#98a6bc' },
    {
        key: 'accent-color',
        title: 'Botones de reproducción y acentos',
        fallback: '#9be4c8',
    },
    {
        key: 'surface-color',
        title: 'Otros botones y superficies',
        fallback: '#283140',
    },
];

export const THEMES = [
    { id: 'custom', title: 'Personalizado' },
    { id: 'cover', title: 'Colores de la carátula' },
    { id: 'midnight', title: 'Medianoche' },
    { id: 'ocean', title: 'Océano' },
    { id: 'sunset', title: 'Atardecer' },
    { id: 'forest', title: 'Bosque' },
    { id: 'light', title: 'Claro' },
];

export const PRESETS = {
    midnight: ['#171c26', '#f3f5fa', '#98a6bc', '#9be4c8', '#283140'],
    ocean: ['#102638', '#f3faff', '#adc6d5', '#69d6ec', '#1c4054'],
    sunset: ['#30202c', '#fff7f0', '#d5b4bf', '#ffad77', '#4d3040'],
    forest: ['#182b24', '#f4faf1', '#a8c4ae', '#b8e079', '#2b4538'],
    light: ['#f4f1e9', '#242831', '#606b76', '#31689a', '#e2e7e7'],
};

export function readColor(settings, definition) {
    const color = settings.get_string(definition.key);
    return /^#[0-9a-f]{6}$/i.test(color)
        ? color.toLowerCase()
        : definition.fallback;
}

export function toHex(red, green, blue) {
    return `#${[red, green, blue]
        .map((value) =>
            Math.round(value * 255)
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;
}

function channels(hex) {
    return [1, 3, 5].map(
        (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
    );
}

export function mix(first, second, amount) {
    const target = channels(second);
    return toHex(
        ...channels(first).map(
            (value, index) => value * (1 - amount) + target[index] * amount,
        ),
    );
}

export function interpolatePalette(first, second, amount) {
    return first.map((color, index) => mix(color, second[index], amount));
}

export function paletteDetails(palette) {
    const [background, text, muted, accent, surface] = palette;
    const [r, g, b] = channels(accent).map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return {
        background,
        text,
        muted,
        accent,
        surface,
        border: mix(background, text, 0.18),
        hover: mix(surface, text, 0.15),
        ink:
            0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179
                ? '#000000'
                : '#ffffff',
    };
}

export function resolvePalette(settings, coverColor = null) {
    const mode = settings.get_string('theme-mode');
    if (mode === 'cover' && coverColor && /^#[0-9a-f]{6}$/i.test(coverColor)) {
        const background = mix('#11151d', coverColor, 0.18);
        const brightness =
            channels(coverColor).reduce((sum, value) => sum + value, 0) / 3;
        const accent =
            brightness < 0.48
                ? mix(coverColor, '#ffffff', (0.48 - brightness) * 1.2)
                : coverColor;
        return [
            background,
            '#f7f9fc',
            '#b5bfcb',
            accent,
            mix(background, coverColor, 0.22),
        ];
    }
    if (mode === 'cover') return PRESETS.midnight;
    if (PRESETS[mode]) return PRESETS[mode];
    return COLORS.map((definition) => readColor(settings, definition));
}
