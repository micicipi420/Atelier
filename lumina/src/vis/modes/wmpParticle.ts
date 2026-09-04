/**
 * "Particle" — WMP 7-10 ("Dotplane" in 7.0): a flat square grid of red,
 * purple, blue and cyan dots whose heights follow the spectrum, viewed from a
 * low camera; "Rotating Particle" spins the plane. Layout after Now Playing's
 * particle.ts (MIT): 22×22 grid, colours #c43b3b #7a3cb8 #2d6cdf #2ec4c8,
 * (x+y)² bin mapping, camera at (0, 0.9, 4.2), fov 42°.
 */
import type { AudioFrame } from '../../audio/analysis';
import type { VisContext, VisInstance, VisualizerMode } from '../types';

const N = 22;
const COLORS = ['#c43b3b', '#7a3cb8', '#2d6cdf', '#2ec4c8'];
const PRESETS = [
  { name: 'Particle', rotate: false },
  { name: 'Rotating Particle', rotate: true },
];

export class WmpParticleVis implements VisInstance {
  private g: CanvasRenderingContext2D | null = null;
  private preset = 0;
  private heights = new Float32Array(N * N);
  private angle = 0;
  private time = 0;
  private order: Int32Array = new Int32Array(N * N);
  private depth = new Float32Array(N * N);
  private sx = new Float32Array(N * N);
  private sy = new Float32Array(N * N);

  init(ctx: VisContext): void {
    this.g = ctx.canvas.getContext('2d');
    try {
      const saved = parseInt(localStorage.getItem('lumina.wmp.particle') ?? '0', 10);
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
      localStorage.setItem('lumina.wmp.particle', String(this.preset));
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
    const alive = frame.active ? 1 : 0.1;
    const bins = frame.freq;
    const bassAtt = Math.min(1, frame.bands.bassAtt / 1.8);
    const rmsAtt = frame.level;
    this.time += frame.dt;
    const fall = frame.active ? 6 : 1.7;
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const t = (x + y) / (2 * (N - 1));
        const idx = Math.floor(t * t * (bins.length - 1));
        const v = (bins[idx] ?? 0) / 255;
        const wave = Math.sin(x * 0.45 + this.time * 1.4 + bassAtt * 2.2) * Math.cos(y * 0.4 + this.time * 1.1) * (0.05 + rmsAtt * 0.4) * alive;
        const target = frame.active ? (v * 1.2 + wave) * alive : this.heights[i]! * 0.96;
        const prev = this.heights[i]!;
        this.heights[i] = target > prev ? target : prev * Math.exp(-fall * frame.dt);
        i++;
      }
    }
    if (p.rotate) this.angle += frame.dt * (0.2 + bassAtt * 0.25) * (frame.active ? 1 : 0.15);
    else this.angle += frame.dt * 0.04 * alive;

    // simple perspective camera: position (0, 0.9, 4.2) looking at the origin, fov 42°
    const camY = 0.9;
    const camZ = 4.2;
    const fov = (42 * Math.PI) / 180;
    const f = 1 / Math.tan(fov / 2);
    const pitch = Math.atan2(camY, camZ);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const ca = Math.cos(this.angle);
    const sa = Math.sin(this.angle);
    i = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const px = (x / (N - 1) - 0.5) * 3.2;
        const pz = (y / (N - 1) - 0.5) * 3.2;
        const py = this.heights[i]!;
        // rotate around Y
        const rx = px * ca + pz * sa;
        const rz = -px * sa + pz * ca;
        // translate to camera, rotate by pitch
        const tx = rx;
        const ty = py - camY;
        const tz = rz - camZ;
        const vy = ty * cp - tz * sp;
        const vz = ty * sp + tz * cp;
        const d = -vz;
        this.depth[i] = d;
        this.order[i] = i;
        const ndcX = (tx * f) / d / (w / h);
        const ndcY = (vy * f) / d;
        this.sx[i] = (ndcX * 0.5 + 0.5) * w;
        this.sy[i] = (1 - (ndcY * 0.5 + 0.5)) * h;
        i++;
      }
    }
    const order = Array.from(this.order).sort((a, b) => this.depth[b]! - this.depth[a]!);
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const baseSize = (0.04 + 0.05 * alive) * (h / 2.2);
    g.globalAlpha = Math.max(0.08, alive);
    for (const k of order) {
      const x = k % N;
      const y = Math.floor(k / N);
      const d = this.depth[k]!;
      if (d <= 0.1) continue;
      const size = Math.max(1.5, (baseSize * 2.2) / d);
      g.fillStyle = COLORS[(x + y) % COLORS.length]!;
      g.beginPath();
      g.arc(this.sx[k]!, this.sy[k]!, size / 2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

export const wmpParticleMode: VisualizerMode = {
  id: 'wmp-particle',
  name: 'WMP · Particle',
  family: 'wmp',
  renderer: 'canvas2d',
  description: 'Windows Media Player 7-10 "Particle": the red/purple/blue/cyan dot plane, flat or rotating',
  create: () => new WmpParticleVis(),
};
