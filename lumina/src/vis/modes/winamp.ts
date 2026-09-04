/**
 * "Winamp Classic" — the 76×16 px spectrum analyser / oscilloscope from the
 * Winamp 2.x main window, drawn as an upscaled LCD with the base-skin
 * viscolor.txt palette. Rendering logic modelled on Winamp's behaviour as
 * re-implemented by Webamp (MIT, captbaritone/webamp).
 */
import type { AudioFrame } from '../../audio/analysis';
import type { VisContext, VisInstance, VisualizerMode } from '../types';

/** viscolor.txt of the classic base skin (24 entries). */
export const VISCOLOR_BASE: [number, number, number][] = [
  [0, 0, 0], // 0  background
  [24, 33, 41], // 1  dots
  [239, 49, 16], // 2  spectrum top
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
  [24, 132, 8], // 17 spectrum bottom
  [255, 255, 255], // 18 oscilloscope 1 (centre)
  [214, 214, 222], // 19
  [181, 189, 189], // 20
  [160, 170, 175], // 21
  [148, 156, 165], // 22 oscilloscope 5 (edges)
  [150, 150, 150], // 23 analyser peak dots
];

const W = 76;
const H = 16;
const NUM_BARS = 19;

type Style = 'bars' | 'thin' | 'osc-line' | 'osc-dots' | 'osc-solid' | 'both';

const PRESETS: { name: string; style: Style }[] = [
  { name: 'Spectrum Analyzer', style: 'bars' },
  { name: 'Spectrum Analyzer (thin)', style: 'thin' },
  { name: 'Oscilloscope (line)', style: 'osc-line' },
  { name: 'Oscilloscope (dots)', style: 'osc-dots' },
  { name: 'Oscilloscope (solid)', style: 'osc-solid' },
  { name: 'Analyzer + Scope', style: 'both' },
];

const css = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

export class WinampVis implements VisInstance {
  private ctx2d: CanvasRenderingContext2D | null = null;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private preset = 0;
  private barHeights = new Float32Array(W);
  private peaks = new Float32Array(W);
  private peakHold = new Float32Array(W);
  private palette = VISCOLOR_BASE;

  constructor() {
    this.off = document.createElement('canvas');
    this.off.width = W;
    this.off.height = H;
    this.offCtx = this.off.getContext('2d')!;
  }

  init(ctx: VisContext): void {
    this.ctx2d = ctx.canvas.getContext('2d');
    try {
      const saved = localStorage.getItem('lumina.winamp.preset');
      if (saved) this.preset = Math.max(0, Math.min(PRESETS.length - 1, parseInt(saved, 10) || 0));
    } catch {
      /* ignore */
    }
  }

  resize(): void {
    /* nothing — we scale every frame */
  }
  destroy(): void {
    this.ctx2d = null;
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
      localStorage.setItem('lumina.winamp.preset', String(this.preset));
    } catch {
      /* ignore */
    }
  }

  private drawSpectrum(frame: AudioFrame, thin: boolean): void {
    const o = this.offCtx;
    const cols = thin ? 75 : NUM_BARS;
    // Log-spaced bands over 75 columns like the original; bars average 4 columns each.
    const bars = frame.bars(cols, { minHz: 40, maxHz: 15000, attack: 0.9, release: 0.55, fall: 0, hold: 0, tilt: true });
    const dt = frame.dt;
    // Winamp: bars fall at a fixed rate; peaks hold then fall accelerating.
    const fallPerSec = 26; // pixels per second
    const peakHoldSec = 0.5;
    const peakFallPerSec = 14;
    for (let i = 0; i < cols; i++) {
      const target = Math.round(bars.values[i]! * H);
      const cur = this.barHeights[i]!;
      this.barHeights[i] = target >= cur ? target : Math.max(target, cur - fallPerSec * dt);
      const h = this.barHeights[i]!;
      if (h >= this.peaks[i]!) {
        this.peaks[i] = h;
        this.peakHold[i] = peakHoldSec;
      } else if (this.peakHold[i]! > 0) {
        this.peakHold[i] = this.peakHold[i]! - dt;
      } else {
        this.peaks[i] = Math.max(0, this.peaks[i]! - peakFallPerSec * dt);
      }
    }
    const barW = thin ? 1 : 3;
    const stride = thin ? 1 : 4;
    for (let i = 0; i < cols; i++) {
      const x = i * stride;
      const h = Math.min(H, Math.round(this.barHeights[i]!));
      for (let y = 0; y < h; y++) {
        // colour 2 is the top of a full bar, 17 the bottom
        const row = H - 1 - y;
        o.fillStyle = css(this.palette[2 + row]!);
        o.fillRect(x, row, barW, 1);
      }
      const p = Math.round(this.peaks[i]!);
      if (p > 0) {
        o.fillStyle = css(this.palette[23]!);
        o.fillRect(x, H - p, barW, 1);
      }
    }
  }

  private drawOscilloscope(frame: AudioFrame, kind: 'line' | 'dots' | 'solid'): void {
    const o = this.offCtx;
    const wave = frame.wave;
    // Take a stable window: start at a rising zero crossing to reduce jitter.
    let start = 0;
    const span = 2 * W;
    for (let i = 1; i < wave.length - span; i++) {
      if (wave[i - 1]! <= 0 && wave[i]! > 0) {
        start = i;
        break;
      }
    }
    let prevY = -1;
    for (let x = 0; x < W; x++) {
      const s = wave[start + x * 2] ?? 0;
      // Winamp scales the scope hard; clamp to the 16-row window.
      let y = Math.round(H / 2 - s * (H / 2) * 1.6);
      y = Math.max(0, Math.min(H - 1, y));
      const dist = Math.abs(y - H / 2 + 0.5);
      const colorIndex = 18 + Math.min(4, Math.floor(dist / 1.6));
      o.fillStyle = css(this.palette[colorIndex]!);
      if (kind === 'dots') {
        o.fillRect(x, y, 1, 1);
      } else if (kind === 'solid') {
        const mid = H / 2;
        const top = Math.min(y, mid);
        const bottom = Math.max(y, mid - 1);
        o.fillRect(x, top, 1, bottom - top + 1);
      } else {
        if (prevY < 0) prevY = y;
        const top = Math.min(prevY, y);
        const bottom = Math.max(prevY, y);
        o.fillRect(x, top, 1, bottom - top + 1);
        prevY = y;
      }
    }
  }

  render(frame: AudioFrame, ctx: VisContext): void {
    const g = this.ctx2d;
    if (!g) return;
    const o = this.offCtx;
    o.fillStyle = css(this.palette[0]!);
    o.fillRect(0, 0, W, H);
    // background dot grid (colour 1) every other pixel like the original
    o.fillStyle = css(this.palette[1]!);
    for (let y = 1; y < H; y += 2) for (let x = 0; x < W; x += 2) o.fillRect(x, y, 1, 1);

    const style = PRESETS[this.preset]!.style;
    if (frame.active) {
      if (style === 'bars') this.drawSpectrum(frame, false);
      else if (style === 'thin') this.drawSpectrum(frame, true);
      else if (style === 'osc-line') this.drawOscilloscope(frame, 'line');
      else if (style === 'osc-dots') this.drawOscilloscope(frame, 'dots');
      else if (style === 'osc-solid') this.drawOscilloscope(frame, 'solid');
      else {
        this.drawSpectrum(frame, false);
        this.drawOscilloscope(frame, 'line');
      }
    } else {
      // idle: let bars and peaks sink
      for (let i = 0; i < W; i++) {
        this.barHeights[i] = Math.max(0, this.barHeights[i]! - 26 * frame.dt);
        this.peaks[i] = Math.max(0, this.peaks[i]! - 14 * frame.dt);
      }
    }

    // upscale with crisp pixels, letterboxed to keep the 76:16 aspect
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    g.fillStyle = '#000';
    g.fillRect(0, 0, cw, ch);
    const scale = Math.max(1, Math.floor(Math.min(cw / W, ch / H)));
    const dw = W * scale;
    const dh = H * scale;
    const dx = Math.floor((cw - dw) / 2);
    const dy = Math.floor((ch - dh) / 2);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.off, dx, dy, dw, dh);
    // subtle LCD scanline sheen
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = dy; y < dy + dh; y += scale) g.fillRect(dx, y + scale - Math.max(1, scale >> 3), dw, Math.max(1, scale >> 3));
  }
}

export const winampMode: VisualizerMode = {
  id: 'winamp-classic',
  name: 'Winamp Classic',
  family: 'winamp',
  renderer: 'canvas2d',
  description: 'The 76×16 spectrum analyser and oscilloscope of the Winamp 2 main window, base-skin colours',
  create: () => new WinampVis(),
};
