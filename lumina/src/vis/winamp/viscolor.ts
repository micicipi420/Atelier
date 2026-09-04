/** VISCOLOR.TXT palettes (24 entries) for the classic Winamp main-window visualiser. */
export type Rgb = [number, number, number];

/** Classic base skin colours (Winamp 2.x base skin VISCOLOR.TXT). */
export const VISCOLOR_BASE: Rgb[] = [
  [0, 0, 0], // 0  background
  [24, 33, 41], // 1  dot grid
  [239, 49, 16], // 2  analyser row 15 (top)
  [206, 41, 16],
  [214, 90, 0],
  [214, 102, 0],
  [214, 115, 0],
  [198, 123, 8],
  [222, 165, 24],
  [214, 181, 33],
  [189, 222, 41],
  [148, 222, 33],
  [41, 206, 16],
  [50, 190, 16],
  [57, 181, 16],
  [49, 156, 8],
  [41, 148, 0],
  [24, 132, 8], // 17 analyser row 0 (bottom)
  [255, 255, 255], // 18 oscilloscope centre
  [214, 214, 222], // 19
  [181, 189, 189], // 20
  [160, 170, 175], // 21
  [148, 156, 165], // 22 oscilloscope extremes
  [150, 150, 150], // 23 peak dots
];

function ramp(from: Rgb, to: Rgb, n: number): Rgb[] {
  const out: Rgb[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    out.push([Math.round(from[0] + (to[0] - from[0]) * t), Math.round(from[1] + (to[1] - from[1]) * t), Math.round(from[2] + (to[2] - from[2]) * t)]);
  }
  return out;
}

function makePalette(bg: Rgb, grid: Rgb, top: Rgb, mid: Rgb, bottom: Rgb, osc: Rgb, oscEdge: Rgb, peak: Rgb): Rgb[] {
  return [bg, grid, ...ramp(top, mid, 8), ...ramp(mid, bottom, 8), ...ramp(osc, oscEdge, 5), peak];
}

export const PALETTES: { name: string; colors: Rgb[] }[] = [
  { name: 'Base skin', colors: VISCOLOR_BASE },
  { name: 'Ice', colors: makePalette([0, 0, 0], [16, 28, 44], [235, 245, 255], [80, 170, 255], [20, 60, 160], [255, 255, 255], [120, 170, 220], [170, 200, 240]) },
  { name: 'Amber', colors: makePalette([0, 0, 0], [40, 26, 8], [255, 230, 120], [255, 150, 20], [170, 60, 0], [255, 240, 200], [200, 130, 60], [230, 180, 90]) },
  { name: 'Phosphor', colors: makePalette([0, 8, 0], [10, 36, 12], [220, 255, 220], [60, 255, 90], [10, 130, 40], [200, 255, 200], [70, 190, 90], [150, 230, 150]) },
  { name: 'Violet', colors: makePalette([4, 0, 10], [30, 16, 48], [255, 200, 255], [220, 70, 255], [90, 20, 160], [255, 240, 255], [180, 120, 220], [210, 160, 240]) },
];

export const css = (c: Rgb) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** Parse a VISCOLOR.TXT file (permissive like Webamp; missing lines fall back to base). */
export function parseViscolor(text: string): Rgb[] {
  const out = VISCOLOR_BASE.map((c) => [...c] as Rgb);
  const lines = text.split(/\r?\n/);
  let i = 0;
  for (const line of lines) {
    const m = /^\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/.exec(line);
    if (!m) continue;
    if (i < 24) out[i] = [Math.min(255, +m[1]!), Math.min(255, +m[2]!), Math.min(255, +m[3]!)];
    i++;
  }
  return out;
}
