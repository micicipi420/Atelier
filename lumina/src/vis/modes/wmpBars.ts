/**
 * "Bars and Waves" — Windows Media Player 7-12's evergreen family: Bars
 * (yellow-green bars with peak caps), Ocean Mist and Fire Storm (layered
 * scrolling spectrum "mountains"), Scope and the unused Dot Scope.
 * Bar dynamics follow Now Playing's barsAndWaves.ts (MIT): exp(-5.2·dt)
 * fall, peak caps falling 0.22/s, linear-below-18 % / pow-1.6 log spectrum.
 */
import type { AudioFrame } from '../../audio/analysis';
import type { VisContext, VisInstance, VisualizerMode } from '../types';

const BAR_COUNT = 48;

/** Now Playing logSpectrum(): linear bass region, power law above. */
export function logSpectrum(freq: Uint8Array, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const warped = x < 0.18 ? (x / 0.18) * 0.12 : 0.12 + Math.pow((x - 0.18) / 0.82, 1.6) * 0.88;
  const idx = warped * (freq.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  const a = (freq[i] ?? 0) / 255;
  const b = (freq[Math.min(freq.length - 1, i + 1)] ?? 0) / 255;
  return a * (1 - f) + b * f;
}

interface Preset {
  name: string;
  mode: 'bars' | 'bars-skin' | 'ocean' | 'fire' | 'scope' | 'dotscope';
}
const PRESETS: Preset[] = [
  { name: 'Bars', mode: 'bars' },
  { name: 'Bars (skin mode, green)', mode: 'bars-skin' },
  { name: 'Ocean Mist', mode: 'ocean' },
  { name: 'Fire Storm', mode: 'fire' },
  { name: 'Scope', mode: 'scope' },
  { name: 'Dot Scope', mode: 'dotscope' },
];

export class WmpBarsVis implements VisInstance {
  private g: CanvasRenderingContext2D | null = null;
  private preset = 0;
  private levels = new Float32Array(BAR_COUNT);
  private peaks = new Float32Array(BAR_COUNT);
  private scroll = 0;
  private layers: Float32Array[] = [new Float32Array(160), new Float32Array(160), new Float32Array(160)];

  init(ctx: VisContext): void {
    this.g = ctx.canvas.getContext('2d');
    try {
      const saved = parseInt(localStorage.getItem('lumina.wmp.bars') ?? '0', 10);
      if (saved >= 0 && saved < PRESETS.length) this.preset = saved;
    } catch {
      /* ignore */
    }
  }
  resize(): void {}
  destroy(): void {
    this.g = null;
  }
  presetCount(): number {
    return PRESETS.length;
  }
  presetName(i = this.preset): string {
    return PRESETS[i]?.name ?? '';
  }
  currentPreset(): number {
    return this.preset;
  }
  setPreset(i: number): void {
    this.preset = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length;
    try {
      localStorage.setItem('lumina.wmp.bars', String(this.preset));
    } catch {
      /* ignore */
    }
  }

  private drawBars(frame: AudioFrame, g: CanvasRenderingContext2D, w: number, h: number, skin: boolean): void {
    const fall = frame.active ? 5.2 : 1.6;
    const dt = frame.dt;
    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / (BAR_COUNT - 1);
      const raw = frame.active ? logSpectrum(frame.freq, t) : 0;
      const target = Math.pow(raw, 1.08);
      const prev = this.levels[i]!;
      this.levels[i] = target > prev ? target : prev * Math.exp(-fall * dt);
      const pk = this.peaks[i]!;
      this.peaks[i] = target > pk ? target : Math.max(0, pk - dt * (frame.active ? 0.22 : 0.12));
    }
    const margin = w * 0.04;
    const baseY = h * 0.86;
    const maxH = h * 0.72;
    const slot = (w - margin * 2) / BAR_COUNT;
    const bw = slot * 0.72;
    // WMP 9 full mode: yellow-green gradient; skin mode: green
    const grad = g.createLinearGradient(0, baseY - maxH, 0, baseY);
    if (skin) {
      grad.addColorStop(0, '#9dff5a');
      grad.addColorStop(0.6, '#3fbf3f');
      grad.addColorStop(1, '#1d6b2a');
    } else {
      grad.addColorStop(0, '#f6ff7a');
      grad.addColorStop(0.45, '#c8e83c');
      grad.addColorStop(1, '#3e9a2a');
    }
    // soft reflection
    g.save();
    g.globalAlpha = 0.18;
    for (let i = 0; i < BAR_COUNT; i++) {
      const bh = this.levels[i]! * maxH;
      const x = margin + i * slot + (slot - bw) / 2;
      g.fillStyle = grad;
      g.fillRect(x, baseY + 2, bw, Math.min(bh * 0.35, h - baseY - 2));
    }
    g.restore();
    for (let i = 0; i < BAR_COUNT; i++) {
      const bh = Math.max(2, this.levels[i]! * maxH);
      const x = margin + i * slot + (slot - bw) / 2;
      g.fillStyle = grad;
      g.fillRect(x, baseY - bh, bw, bh);
      const py = baseY - this.peaks[i]! * maxH - 3;
      g.fillStyle = skin ? '#d8ffd0' : '#fffbe0';
      g.fillRect(x, py, bw, 2);
    }
  }

  private drawMountains(frame: AudioFrame, g: CanvasRenderingContext2D, w: number, h: number, fire: boolean): void {
    const n = 160;
    const alive = frame.active ? 1 : 0;
    if (frame.active) this.scroll += frame.dt * 0.03;
    // mirrored (triangle-wave) sampling so the slow scroll never shows a seam
    const tri = (x: number) => {
      const m = ((x % 2) + 2) % 2;
      return m > 1 ? 2 - m : m;
    };
    const spec = (x: number) => logSpectrum(frame.freq, Math.pow(tri(x), 1.15)) * alive;
    const L = this.layers;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const s = u + this.scroll;
      const h1 = (spec(s) + spec(s + 0.006) + spec(s - 0.006)) / 3;
      const h2 = spec(s * 0.9 + 0.1) * 0.72 + h1 * 0.28;
      const h3 = spec(s * 0.7 + 0.25) * 0.55;
      // smooth over time so the ridges roll instead of flicker
      L[0]![i] = L[0]![i]! + (h1 - L[0]![i]!) * (h1 > L[0]![i]! ? 0.5 : 0.15);
      L[1]![i] = L[1]![i]! + (h2 - L[1]![i]!) * 0.2;
      L[2]![i] = L[2]![i]! + (h3 - L[2]![i]!) * 0.12;
    }
    const pal = fire ? ['#100404', '#7a1e08', '#e05018', '#ffd080'] : ['#041018', '#0f4a68', '#1a8ab0', '#d5f4f2'];
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#000');
    bg.addColorStop(1, pal[0]!);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const order = [2, 1, 0];
    const cols = [pal[1]!, pal[2]!, pal[3]!];
    const alphas = [0.55, 0.75, 1];
    for (let k = 0; k < 3; k++) {
      const li = order[k]!;
      const layer = L[li]!;
      const scale = h * (li === 0 ? 0.5 : li === 1 ? 0.62 : 0.72) * (fire ? 1.05 : 1);
      const base = h * (0.95 - k * 0.03);
      const grad = g.createLinearGradient(0, base - scale, 0, base);
      grad.addColorStop(0, cols[k]!);
      grad.addColorStop(1, pal[0]!);
      g.globalAlpha = alphas[k]!;
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, base);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const y = base - layer[i]! * scale;
        g.lineTo(x, y);
      }
      g.lineTo(w, base);
      g.closePath();
      g.fill();
      if (k === 2) {
        g.strokeStyle = fire ? 'rgba(255,240,200,0.8)' : 'rgba(230,250,255,0.75)';
        g.lineWidth = Math.max(1, w / 900);
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const y = base - layer[i]! * scale;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  private drawScope(frame: AudioFrame, g: CanvasRenderingContext2D, w: number, h: number, dots: boolean): void {
    const n = 256;
    const wave = frame.wave;
    const amp = h * 0.36 * (frame.active ? 1 : 0.05);
    // trigger on a rising zero crossing for a stable trace
    let start = 0;
    for (let i = 1; i < wave.length / 2; i++) {
      if (wave[i - 1]! <= 0 && wave[i]! > 0) {
        start = i;
        break;
      }
    }
    const span = wave.length / 2;
    g.strokeStyle = '#9ad4e8';
    g.fillStyle = '#9ad4e8';
    g.lineWidth = Math.max(1.5, w / 700);
    g.lineJoin = 'round';
    g.shadowColor = 'rgba(154,212,232,0.8)';
    g.shadowBlur = Math.max(4, w / 160);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const src = start + Math.floor((i / n) * span);
      const v = wave[src] ?? 0;
      const x = w * 0.03 + (i / (n - 1)) * w * 0.94;
      const y = h / 2 - v * amp;
      if (dots) g.fillRect(x - 1.5, y - 1.5, 3, 3);
      else if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    if (!dots) g.stroke();
    g.shadowBlur = 0;
  }

  render(frame: AudioFrame, ctx: VisContext): void {
    const g = this.g;
    if (!g) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const p = PRESETS[this.preset]!;
    if (p.mode === 'ocean' || p.mode === 'fire') {
      this.drawMountains(frame, g, w, h, p.mode === 'fire');
      return;
    }
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    if (p.mode === 'bars' || p.mode === 'bars-skin') this.drawBars(frame, g, w, h, p.mode === 'bars-skin');
    else this.drawScope(frame, g, w, h, p.mode === 'dotscope');
  }
}

export const wmpBarsMode: VisualizerMode = {
  id: 'wmp-bars-waves',
  name: 'WMP · Bars and Waves',
  family: 'wmp',
  renderer: 'canvas2d',
  description: 'Windows Media Player 7-12 "Bars and Waves": Bars, Ocean Mist, Fire Storm, Scope, Dot Scope',
  create: () => new WmpBarsVis(),
};
