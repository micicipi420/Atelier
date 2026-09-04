/**
 * "Winamp Classic" — the 76×16 px spectrum analyser / oscilloscope of the
 * Winamp 2.x/5.x main window, upscaled as a crisp LCD.
 *
 * The behaviour (75-band log/linear blend, 4.4 fixed-point bar falloff, 8.8
 * fixed-point peaks that hang then accelerate, colouring modes, oscilloscope
 * styles and colour table, idle animation) is ported from Webamp's
 * VisPainter.ts (MIT, Jordan Eldredge), which reverse-engineered Winamp
 * 2.63/5.666. The spectrum comes from the Nullsoft FFT, not AnalyserNode's.
 */
import type { AudioFrame } from '../../audio/analysis';
import type { VisContext, VisInstance, VisualizerMode } from '../types';
import { FFT } from '../winamp/fftNullsoft';
import { PALETTES, css, type Rgb } from '../winamp/viscolor';

const W = 76;
const H = 16;
const COLS = 75;
const MAX_HEIGHT = 15;
/** Winamp's SA thread runs at a fixed rate; simulate physics at this step. */
const SIM_HZ = 60;

type Coloring = 'normal' | 'fire' | 'line';
type Bandwidth = 'wide' | 'thin';
type OscStyle = 'lines' | 'dots' | 'solid';

interface Preset {
  name: string;
  sa: 'analyzer' | 'oscilloscope';
  bandwidth?: Bandwidth;
  coloring?: Coloring;
  oscStyle?: OscStyle;
}

const PRESETS: Preset[] = [
  { name: 'Analyzer', sa: 'analyzer', bandwidth: 'wide', coloring: 'normal' },
  { name: 'Analyzer · thin bands', sa: 'analyzer', bandwidth: 'thin', coloring: 'normal' },
  { name: 'Analyzer · fire', sa: 'analyzer', bandwidth: 'wide', coloring: 'fire' },
  { name: 'Analyzer · line', sa: 'analyzer', bandwidth: 'wide', coloring: 'line' },
  { name: 'Oscilloscope · lines', sa: 'oscilloscope', oscStyle: 'lines' },
  { name: 'Oscilloscope · dots', sa: 'oscilloscope', oscStyle: 'dots' },
  { name: 'Oscilloscope · solid', sa: 'oscilloscope', oscStyle: 'solid' },
];

/** config_safalloff 0..4 → dbx; default "moderate" = 12 (0.75 px / frame). */
const FALLOFF = 12;
/** config_sa_peak_falloff 0..4 → spfo; default "slow" = 1.1. */
const PEAK_FALLOFF = 1.1;

export class WinampVis implements VisInstance {
  private g: CanvasRenderingContext2D | null = null;
  private off = document.createElement('canvas');
  private o: CanvasRenderingContext2D;
  private bg = document.createElement('canvas');
  private preset = 0;
  private paletteIdx = 0;
  private colors: Rgb[] = PALETTES[0]!.colors;
  private fft = new FFT();
  private inWave = new Float32Array(1024);
  private spectrum = new Float32Array(512);
  private sample = new Float32Array(COLS);
  private saData = new Float32Array(COLS);
  private saFalloff = new Float32Array(COLS);
  private saPeaks = new Int32Array(COLS);
  private peakVel = new Float32Array(COLS);
  private barPeak = new Float32Array(COLS);
  private accumulator = 0;
  private idlePos = 0;
  private wasActive = false;

  constructor() {
    this.off.width = W;
    this.off.height = H;
    this.o = this.off.getContext('2d')!;
    this.bg.width = W;
    this.bg.height = H;
  }

  init(ctx: VisContext): void {
    this.g = ctx.canvas.getContext('2d');
    try {
      const saved = JSON.parse(localStorage.getItem('lumina.winamp') ?? '{}') as { preset?: number; palette?: number };
      if (typeof saved.preset === 'number') this.preset = Math.max(0, Math.min(PRESETS.length - 1, saved.preset));
      if (typeof saved.palette === 'number') this.paletteIdx = Math.max(0, Math.min(PALETTES.length - 1, saved.palette));
    } catch {
      /* ignore */
    }
    this.applyPalette();
  }
  resize(): void {
    /* we scale every frame */
  }
  destroy(): void {
    this.g = null;
  }

  private persist(): void {
    try {
      localStorage.setItem('lumina.winamp', JSON.stringify({ preset: this.preset, palette: this.paletteIdx }));
    } catch {
      /* ignore */
    }
  }
  private applyPalette(): void {
    this.colors = PALETTES[this.paletteIdx]!.colors;
    // pre-render background: colour 0 + dot grid of colour 1 every other pixel (Webamp preRenderBg)
    const b = this.bg.getContext('2d')!;
    b.fillStyle = css(this.colors[0]!);
    b.fillRect(0, 0, W, H);
    b.fillStyle = css(this.colors[1]!);
    for (let x = 0; x < W; x += 2) for (let y = 1; y < H; y += 2) b.fillRect(x, y, 1, 1);
  }

  presetCount(): number {
    return PRESETS.length;
  }
  presetName(i = this.preset): string {
    return `${PRESETS[i]?.name ?? ''} · ${PALETTES[this.paletteIdx]!.name}`;
  }
  currentPreset(): number {
    return this.preset;
  }
  setPreset(i: number): void {
    this.preset = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length;
    this.persist();
  }
  nextPalette(): void {
    this.paletteIdx = (this.paletteIdx + 1) % PALETTES.length;
    this.applyPalette();
    this.persist();
  }
  onKey(e: KeyboardEvent): boolean {
    if (e.key === 'k' || e.key === 'K') {
      this.nextPalette();
      return true;
    }
    return false;
  }

  /** One simulation step of the analyser (Webamp paintAnalyzer, per frame at ~60 Hz). */
  private stepAnalyzer(frame: AudioFrame, bandwidth: Bandwidth): void {
    // Webamp feeds (byte - 128) / 24 of a 1024-sample window into the Nullsoft FFT.
    const wave = frame.wave;
    const off = Math.max(0, wave.length - 1024);
    for (let i = 0; i < 1024; i++) this.inWave[i] = (wave[off + i]! * 128) / 24;
    this.fft.timeToFrequencyDomain(this.inWave, this.spectrum);

    // 75 bands: blend of linear and logarithmic bin mapping (scale 0.91 ≈ Winamp 5.x; 0 = Winamp 2.x linear)
    const maxFreqIndex = 512;
    const logMax = Math.log10(maxFreqIndex);
    const scale = 0.91;
    for (let x = 0; x < COLS; x++) {
      const linearIndex = (x / (COLS - 1)) * (maxFreqIndex - 1);
      const logIndex = Math.pow(10, (logMax * x) / (COLS - 1));
      const scaled = (1 - scale) * linearIndex + scale * logIndex;
      let i1 = Math.min(maxFreqIndex - 1, Math.floor(scaled));
      let i2 = Math.min(maxFreqIndex - 1, Math.ceil(scaled));
      if (i1 === i2) this.sample[x] = this.spectrum[i1]!;
      else {
        const f2 = scaled - i1;
        this.sample[x] = (1 - f2) * this.spectrum[i1]! + f2 * this.spectrum[i2]!;
      }
      void i1;
      void i2;
    }

    for (let x = 0; x < COLS; x++) {
      let v: number;
      if (bandwidth === 'wide') {
        const chunk = x & ~3;
        v = (this.sample[chunk]! + (this.sample[chunk + 1] ?? 0) + (this.sample[chunk + 2] ?? 0) + (this.sample[chunk + 3] ?? 0)) / 4;
      } else v = this.sample[x]!;
      v = Math.min(MAX_HEIGHT, v);
      this.saData[x] = v;
      if (this.saPeaks[x]! >= MAX_HEIGHT * 256) this.saPeaks[x] = MAX_HEIGHT * 256;

      // bar falloff: dbx/16 px per frame, bars snap up instantly
      this.saFalloff[x] = this.saFalloff[x]! - FALLOFF / 16;
      if (this.saFalloff[x]! <= v) this.saFalloff[x] = v;

      // peak: 8.8 fixed point, velocity starts at 3 and multiplies by spfo every frame
      if (this.saPeaks[x]! <= Math.round(this.saFalloff[x]! * 256)) {
        this.saPeaks[x] = Math.round(this.saFalloff[x]! * 256);
        this.peakVel[x] = 3.0;
      }
      this.barPeak[x] = this.saPeaks[x]! / 256;
      this.saPeaks[x] = this.saPeaks[x]! - Math.round(this.peakVel[x]!);
      this.peakVel[x] = this.peakVel[x]! * PEAK_FALLOFF;
      if (this.saPeaks[x]! <= 0) this.saPeaks[x] = 0;
      if (Math.round(this.barPeak[x]!) < 1) this.barPeak[x] = -3; // hide
    }
  }

  private stepIdle(): void {
    for (let x = 0; x < COLS; x++) {
      this.saFalloff[x] = Math.max(0, this.saFalloff[x]! - FALLOFF / 16);
      this.saPeaks[x] = Math.max(0, this.saPeaks[x]! - Math.round(this.peakVel[x]!));
      this.peakVel[x] = this.peakVel[x]! * PEAK_FALLOFF;
      this.barPeak[x] = this.saPeaks[x]! / 256;
      if (Math.round(this.barPeak[x]!) < 1) this.barPeak[x] = -3;
    }
    this.idlePos++;
  }

  private paintAnalyzer(p: Preset, idle: boolean): void {
    const o = this.o;
    const c = this.colors;
    const wide = p.bandwidth === 'wide';
    // Winamp idle: one full-height bar bouncing across the columns
    let idleCol = -1;
    if (idle) {
      const pos = this.idlePos % 150;
      idleCol = pos < 75 ? pos : 149 - pos;
    }
    for (let x = 0; x < COLS; x++) {
      if (wide && (x & 3) === 3) continue;
      let h = Math.round(this.saFalloff[x]!);
      if (idle && (wide ? (x & ~3) === (idleCol & ~3) : x === idleCol)) h = MAX_HEIGHT;
      if (h > 0) {
        for (let row = 0; row < h; row++) {
          // row 0 = bottom
          let ci: number;
          if (p.coloring === 'fire') ci = 2 + (h - 1 - row);
          else if (p.coloring === 'line') ci = 17 - (h - 1);
          else ci = 17 - row;
          o.fillStyle = css(c[Math.max(2, Math.min(17, ci))]!);
          o.fillRect(x, H - 1 - row, 1, 1);
        }
      }
      const peak = this.barPeak[x]!;
      if (peak >= 1) {
        o.fillStyle = css(c[23]!);
        o.fillRect(x, H - 1 - Math.round(peak) + 1 - 1, 1, 1);
      }
    }
  }

  private paintOscilloscope(frame: AudioFrame, p: Preset, idle: boolean): void {
    const o = this.o;
    const c = this.colors;
    const wave = frame.wave;
    // Webamp: 576 bytes of the 1024 window, one sample every floor(576/75)=7
    const base = Math.max(0, wave.length - 1024);
    const slice = 7;
    let lastY = 0;
    for (let x = 0; x < COLS; x++) {
      let byte: number;
      if (idle) byte = 128 + 7 * Math.sin((this.idlePos + x) * 0.1) * 8;
      else byte = 128 + Math.max(-1, Math.min(1, wave[base + x * slice] ?? 0)) * 127;
      let y = Math.round((byte / 16) * 2) - 9;
      y = Math.max(0, Math.min(H - 1, y));
      const v = y;
      if (x === 0) lastY = y;
      let top = y;
      let bottom = lastY;
      lastY = y;
      if (p.oscStyle === 'solid') {
        if (y >= 8) {
          top = 8;
          bottom = y;
        } else {
          top = y;
          bottom = 7;
        }
      } else if (p.oscStyle === 'dots') {
        top = y;
        bottom = y;
      } else if (bottom < top) {
        [bottom, top] = [top, bottom];
        top++; // Winamp/WACUP quirk when the line descends
      }
      o.fillStyle = css(c[18 + colorIndex(v)]!);
      for (let yy = top; yy <= bottom; yy++) o.fillRect(x, yy, 1, 1);
    }
    if (idle) this.idlePos++;
  }

  render(frame: AudioFrame, ctx: VisContext): void {
    const g = this.g;
    if (!g) return;
    const p = PRESETS[this.preset]!;
    const active = frame.active;
    if (active !== this.wasActive) {
      this.wasActive = active;
      this.accumulator = 0;
    }
    // fixed-step physics so falloff speed does not depend on the display refresh rate
    if (p.sa === 'analyzer') {
      this.accumulator += frame.dt;
      let steps = Math.floor(this.accumulator * SIM_HZ);
      if (steps > 4) steps = 4;
      if (steps > 0) this.accumulator -= steps / SIM_HZ;
      for (let s = 0; s < steps; s++) {
        if (active) this.stepAnalyzer(frame, p.bandwidth ?? 'wide');
        else this.stepIdle();
      }
    }
    const o = this.o;
    o.drawImage(this.bg, 0, 0);
    if (p.sa === 'analyzer') this.paintAnalyzer(p, !active);
    else this.paintOscilloscope(frame, p, !active);

    // upscale with integer nearest-neighbour, letterboxed to keep 76:16
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    g.fillStyle = css(this.colors[0]!);
    g.fillRect(0, 0, cw, ch);
    const scale = Math.max(1, Math.floor(Math.min(cw / W, ch / H)));
    const dw = W * scale;
    const dh = H * scale;
    const dx = Math.floor((cw - dw) / 2);
    const dy = Math.floor((ch - dh) / 2);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.off, dx, dy, dw, dh);
    if (scale >= 6) {
      // faint pixel-grid sheen so the upscaled LCD reads as pixels
      g.fillStyle = 'rgba(0,0,0,0.16)';
      const t = Math.max(1, Math.round(scale / 10));
      for (let y = dy + scale - t; y < dy + dh; y += scale) g.fillRect(dx, y, dw, t);
      for (let x = dx + scale - t; x < dx + dw; x += scale) g.fillRect(x, dy, t, dh);
    }
  }
}

/** Webamp WavePaintHandler.colorIndex: oscilloscope colour by row (0..15). */
function colorIndex(y: number): number {
  if (y >= 14) return 4;
  if (y >= 12) return 3;
  if (y >= 10) return 2;
  if (y >= 8) return 1;
  if (y >= 6) return 0;
  if (y >= 4) return 1;
  if (y >= 2) return 2;
  return 3;
}

export const winampMode: VisualizerMode = {
  id: 'winamp-classic',
  name: 'Winamp Classic',
  family: 'winamp',
  renderer: 'canvas2d',
  description: 'The 76×16 spectrum analyser and oscilloscope of the Winamp 2 main window (Nullsoft FFT, viscolor palettes). K: next palette',
  create: () => new WinampVis(),
};
