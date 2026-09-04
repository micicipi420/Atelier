/**
 * "Spikes" — WMP 7-10 (Bars and Waves family): Spike (radial lines from an
 * inner ring, spinning) and Amoeba ("round circles that stretch outward").
 * Geometry after Now Playing's spikes.ts (MIT): 72 spikes, inner r 0.1, spin
 * 0.12 + 0.18·bass rad/s, 3-tap smoothed blob with wobble.
 * Colours: Spike red / Amoeba green in WMP 7-8; both yellow in WMP 9-10.
 */
import type { AudioFrame } from '../../audio/analysis';
import type { VisContext, VisInstance, VisualizerMode } from '../types';
import { logSpectrum } from './wmpBars';

const COUNT = 72;
interface Preset {
  name: string;
  mode: 'spike' | 'amoeba';
  color: string;
  color2: string;
}
const PRESETS: Preset[] = [
  { name: 'Spike (WMP 9)', mode: 'spike', color: '#e8c04a', color2: '#fff2a0' },
  { name: 'Amoeba (WMP 9)', mode: 'amoeba', color: '#d4e04a', color2: '#f4ffa0' },
  { name: 'Spike (WMP 7, red)', mode: 'spike', color: '#e03030', color2: '#ff9080' },
  { name: 'Amoeba (WMP 7, green)', mode: 'amoeba', color: '#40c040', color2: '#b0ffb0' },
];

export class WmpSpikesVis implements VisInstance {
  private g: CanvasRenderingContext2D | null = null;
  private preset = 0;
  private smooth = new Float32Array(COUNT);
  private spin = 0;

  init(ctx: VisContext): void {
    this.g = ctx.canvas.getContext('2d');
    try {
      const saved = parseInt(localStorage.getItem('lumina.wmp.spikes') ?? '0', 10);
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
      localStorage.setItem('lumina.wmp.spikes', String(this.preset));
    } catch {
      /* ignore */
    }
  }

  render(frame: AudioFrame, ctx: VisContext): void {
    const g = this.g;
    if (!g) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const p = PRESETS[this.preset]!;
    const alive = frame.active ? 1 : 0.15;
    const bass = Math.min(1, frame.bands.bassAtt / 1.8);
    this.spin += frame.dt * (0.12 + bass * 0.18) * alive;
    const fall = frame.active ? 4.2 : 1.5;
    for (let i = 0; i < COUNT; i++) {
      const raw = frame.active ? logSpectrum(frame.freq, i / COUNT) : 0;
      const prev = this.smooth[i]!;
      this.smooth[i] = raw > prev ? raw : prev * Math.exp(-fall * frame.dt);
    }
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.5;
    g.lineWidth = Math.max(1.5, R / 220);
    g.lineCap = 'round';
    if (p.mode === 'spike') {
      for (let i = 0; i < COUNT; i++) {
        const a = (i / COUNT) * Math.PI * 2 - Math.PI / 2 + this.spin;
        const inner = 0.1 * R;
        const outer = (0.14 + this.smooth[i]! * 0.82 * Math.max(0.05, alive)) * R;
        const grad = g.createLinearGradient(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, p.color2);
        g.strokeStyle = grad;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        g.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        g.stroke();
      }
    } else {
      g.strokeStyle = p.color;
      g.fillStyle = p.color;
      g.beginPath();
      for (let i = 0; i <= COUNT; i++) {
        const k = i % COUNT;
        const a = (k / COUNT) * Math.PI * 2 + this.spin * 0.6;
        const i0 = (k + COUNT - 1) % COUNT;
        const i1 = (k + 1) % COUNT;
        const sm = (this.smooth[i0]! + this.smooth[k]! + this.smooth[i1]!) / 3;
        const wobble = 0.04 * Math.sin(a * 3.0 + this.spin * 4.0) * alive;
        const r = (0.2 + sm * 0.58 + bass * 0.06 + wobble) * Math.max(0.12, alive) * R;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.globalAlpha = 0.18;
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
    }
  }
}

export const wmpSpikesMode: VisualizerMode = {
  id: 'wmp-spikes',
  name: 'WMP · Spikes',
  family: 'wmp',
  renderer: 'canvas2d',
  description: 'Windows Media Player 7-10 "Spikes": Spike and Amoeba, in WMP 9 yellow or WMP 7 red/green',
  create: () => new WmpSpikesVis(),
};
