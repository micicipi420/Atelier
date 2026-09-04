/**
 * Analysis pipeline shared by every visualizer mode.
 *
 * One AudioFrame is computed per animation frame from the engine's analysers:
 *  - byte + float spectrum, time-domain waveform (mono, L, R)
 *  - MilkDrop-style bass/mid/treb with immediate, averaged and long-averaged
 *    values (the classic `bass`, `bass_att` variables — algorithm modelled on
 *    MilkDrop 2 / Butterchurn's AudioLevels, re-implemented here)
 *  - RMS volume, energy-based beat detector (Frédéric Patin's adaptive
 *    threshold, "Beat Detection Algorithms", GameDev.net 2003)
 *  - log-spaced bar bands with peak hold (memoised per bar count)
 */

export interface Bands {
  /** immediate value relative to long-term average (≈1.0 = average loudness) */
  bass: number;
  mid: number;
  treb: number;
  /** attenuated (smoothed) versions */
  bassAtt: number;
  midAtt: number;
  trebAtt: number;
  /** raw summed byte energy of each band, 0..1 normalised */
  bassRaw: number;
  midRaw: number;
  trebRaw: number;
}

export interface AudioFrame {
  /** seconds since page start */
  time: number;
  /** seconds since the previous frame (clamped to 0.1) */
  dt: number;
  frame: number;
  sampleRate: number;
  fftSize: number;
  /** 0..255 per FFT bin (length fftSize/2) */
  freq: Uint8Array;
  /** dB per FFT bin */
  freqDb: Float32Array;
  /** time-domain samples, -1..1 (length fftSize) */
  wave: Float32Array;
  waveL: Float32Array;
  waveR: Float32Array;
  bands: Bands;
  /** 0..1 RMS of the waveform */
  rms: number;
  /** smoothed loudness, 0..1 */
  level: number;
  /** true on the frame a beat was detected */
  beat: boolean;
  /** 0..1, decays after each beat */
  beatEnergy: number;
  /** frames per second estimate */
  fps: number;
  /** whether audio is actually playing (else values are near zero) */
  active: boolean;
  /** log-spaced bar values in 0..1 (memoised per count) */
  bars(count: number, opts?: BarOptions): BarSet;
  /** frequency in Hz of a given FFT bin */
  binHz(bin: number): number;
}

export interface BarOptions {
  minHz?: number;
  maxHz?: number;
  /** peak fall speed in units per second (default 0.9) */
  fall?: number;
  /** hold time in seconds before a peak starts falling (default 0.25) */
  hold?: number;
  /** attack smoothing 0..1 (1 = instant) */
  attack?: number;
  /** release smoothing 0..1 (1 = instant) */
  release?: number;
  /** apply a treble tilt so bars look balanced (default true) */
  tilt?: boolean;
}

export interface BarSet {
  values: Float32Array;
  peaks: Float32Array;
}

interface BarState {
  values: Float32Array;
  peaks: Float32Array;
  holds: Float32Array;
  lo: Int32Array;
  hi: Int32Array;
  key: string;
}

export function adjustRateToFPS(rate: number, baseFPS: number, fps: number): number {
  return Math.pow(rate, baseFPS / fps);
}

/** MilkDrop-style 3-band tracker. */
class BandTracker {
  private starts = [0, 0, 0];
  private stops = [0, 0, 0];
  private imm = new Float32Array(3);
  private avg = new Float32Array(3);
  private longAvg = new Float32Array(3);
  private val = new Float32Array(3);
  private att = new Float32Array(3);
  private frames = 0;
  private configured = false;

  configure(sampleRate: number, fftSize: number) {
    const numBins = fftSize / 2;
    const bucketHz = sampleRate / fftSize;
    const clamp = (v: number) => Math.max(0, Math.min(numBins - 1, v));
    const bassLow = clamp(Math.round(20 / bucketHz) - 1);
    const bassHigh = clamp(Math.round(320 / bucketHz) - 1);
    const midHigh = clamp(Math.round(2800 / bucketHz) - 1);
    const trebHigh = clamp(Math.round(11025 / bucketHz) - 1);
    this.starts = [bassLow, bassHigh, midHigh];
    this.stops = [bassHigh, midHigh, trebHigh];
    this.configured = true;
  }

  update(freq: Uint8Array, fps: number, out: Bands) {
    if (!this.configured) return;
    let effectiveFPS = fps;
    if (!Number.isFinite(effectiveFPS) || effectiveFPS < 15) effectiveFPS = 15;
    else if (effectiveFPS > 144) effectiveFPS = 144;
    this.frames++;
    for (let i = 0; i < 3; i++) {
      let sum = 0;
      const a = this.starts[i]!;
      const b = this.stops[i]!;
      for (let j = a; j < b; j++) sum += freq[j]!;
      this.imm[i] = sum;
    }
    for (let i = 0; i < 3; i++) {
      let rate = this.imm[i]! > this.avg[i]! ? 0.2 : 0.5;
      rate = adjustRateToFPS(rate, 30, effectiveFPS);
      this.avg[i] = this.avg[i]! * rate + this.imm[i]! * (1 - rate);
      rate = this.frames < 50 ? 0.9 : 0.992;
      rate = adjustRateToFPS(rate, 30, effectiveFPS);
      this.longAvg[i] = this.longAvg[i]! * rate + this.imm[i]! * (1 - rate);
      if (this.longAvg[i]! < 0.001) {
        this.val[i] = 1;
        this.att[i] = 1;
      } else {
        this.val[i] = this.imm[i]! / this.longAvg[i]!;
        this.att[i] = this.avg[i]! / this.longAvg[i]!;
      }
    }
    out.bass = this.val[0]!;
    out.mid = this.val[1]!;
    out.treb = this.val[2]!;
    out.bassAtt = this.att[0]!;
    out.midAtt = this.att[1]!;
    out.trebAtt = this.att[2]!;
    const norm = (i: number) => {
      const n = Math.max(1, this.stops[i]! - this.starts[i]!) * 255;
      return this.imm[i]! / n;
    };
    out.bassRaw = norm(0);
    out.midRaw = norm(1);
    out.trebRaw = norm(2);
  }
}

/**
 * Energy-based beat detector with adaptive threshold.
 * Keeps ~1 s of history of low-band energy and fires when the instant energy
 * exceeds C · average, with C derived from the variance of the history.
 */
class BeatDetector {
  private history = new Float32Array(43);
  private idx = 0;
  private filled = 0;
  private lastBeat = -1;
  energy = 0;
  beat = false;

  update(instant: number, time: number, dt: number) {
    let avg = 0;
    for (let i = 0; i < this.filled; i++) avg += this.history[i]!;
    avg = this.filled ? avg / this.filled : 0;
    let variance = 0;
    for (let i = 0; i < this.filled; i++) {
      const d = this.history[i]! - avg;
      variance += d * d;
    }
    variance = this.filled ? variance / this.filled : 0;
    // Patin: C = -0.0025714 * V + 1.5142857 (V is variance on 0..1 energies scaled up)
    const c = Math.max(1.15, Math.min(1.6, -0.0025714 * (variance * 10000) + 1.5142857));
    this.history[this.idx] = instant;
    this.idx = (this.idx + 1) % this.history.length;
    this.filled = Math.min(this.filled + 1, this.history.length);
    this.beat = false;
    const minInterval = 0.22;
    if (this.filled > 10 && instant > 0.02 && instant > c * avg && time - this.lastBeat > minInterval) {
      this.beat = true;
      this.lastBeat = time;
      this.energy = 1;
    } else {
      this.energy = Math.max(0, this.energy - dt * 3.5);
    }
  }
}

export class Analyzer {
  private freq: Uint8Array<ArrayBuffer>;
  private freqDb: Float32Array<ArrayBuffer>;
  private wave: Float32Array<ArrayBuffer>;
  private waveL: Float32Array<ArrayBuffer>;
  private waveR: Float32Array<ArrayBuffer>;
  private bands: BandTracker = new BandTracker();
  private beat = new BeatDetector();
  private barStates = new Map<string, BarState>();
  private lastTime = 0;
  private frameNo = 0;
  private fpsAvg = 60;
  private level = 0;
  private lastBands: Bands = {
    bass: 1,
    mid: 1,
    treb: 1,
    bassAtt: 1,
    midAtt: 1,
    trebAtt: 1,
    bassRaw: 0,
    midRaw: 0,
    trebRaw: 0,
  };
  private configuredRate = 0;
  readonly fftSize: number;

  constructor(fftSize: number) {
    this.fftSize = fftSize;
    const bins = fftSize / 2;
    this.freq = new Uint8Array(bins);
    this.freqDb = new Float32Array(bins).fill(-100);
    this.wave = new Float32Array(fftSize);
    this.waveL = new Float32Array(fftSize);
    this.waveR = new Float32Array(fftSize);
  }

  /**
   * Pull fresh data from the analysers and build the frame.
   * When `mono` is null (no AudioContext yet) the frame is silent but valid.
   */
  capture(
    mono: AnalyserNode | null,
    left: AnalyserNode | null,
    right: AnalyserNode | null,
    sampleRate: number,
    active: boolean,
    now = performance.now() / 1000,
  ): AudioFrame {
    const dt = this.lastTime ? Math.min(0.1, Math.max(0.0005, now - this.lastTime)) : 1 / 60;
    this.lastTime = now;
    this.frameNo++;
    const instFps = 1 / dt;
    this.fpsAvg = this.fpsAvg * 0.95 + instFps * 0.05;

    if (mono) {
      if (this.configuredRate !== sampleRate) {
        this.bands.configure(sampleRate, this.fftSize);
        this.configuredRate = sampleRate;
      }
      mono.getByteFrequencyData(this.freq);
      mono.getFloatFrequencyData(this.freqDb);
      mono.getFloatTimeDomainData(this.wave);
      if (left && right) {
        left.getFloatTimeDomainData(this.waveL);
        right.getFloatTimeDomainData(this.waveR);
      } else {
        this.waveL.set(this.wave);
        this.waveR.set(this.wave);
      }
    } else {
      this.freq.fill(0);
      this.wave.fill(0);
      this.waveL.fill(0);
      this.waveR.fill(0);
    }

    // RMS
    let sq = 0;
    for (let i = 0; i < this.wave.length; i++) sq += this.wave[i]! * this.wave[i]!;
    const rms = Math.sqrt(sq / this.wave.length);
    const target = Math.min(1, rms * 2.5);
    this.level += (target - this.level) * (target > this.level ? 0.5 : 0.08);

    if (mono) this.bands.update(this.freq, this.fpsAvg, this.lastBands);
    this.beat.update(this.lastBands.bassRaw * 0.75 + this.lastBands.midRaw * 0.25, now, dt);

    const self = this;
    const frame: AudioFrame = {
      time: now,
      dt,
      frame: this.frameNo,
      sampleRate,
      fftSize: this.fftSize,
      freq: this.freq,
      freqDb: this.freqDb,
      wave: this.wave,
      waveL: this.waveL,
      waveR: this.waveR,
      bands: this.lastBands,
      rms,
      level: this.level,
      beat: this.beat.beat,
      beatEnergy: this.beat.energy,
      fps: this.fpsAvg,
      active,
      bars: (count, opts) => self.computeBars(count, opts, sampleRate, dt),
      binHz: (bin) => (bin * sampleRate) / self.fftSize,
    };
    return frame;
  }

  private computeBars(count: number, opts: BarOptions | undefined, sampleRate: number, dt: number): BarSet {
    const minHz = opts?.minHz ?? 35;
    const maxHz = opts?.maxHz ?? 16000;
    const fall = opts?.fall ?? 0.9;
    const hold = opts?.hold ?? 0.25;
    const attack = opts?.attack ?? 0.75;
    const release = opts?.release ?? 0.35;
    const tilt = opts?.tilt ?? true;
    const key = `${count}|${minHz}|${maxHz}|${tilt ? 1 : 0}`;
    let st = this.barStates.get(key);
    const bins = this.freq.length;
    const binHz = sampleRate / this.fftSize;
    if (!st || st.key !== key) {
      const lo = new Int32Array(count);
      const hi = new Int32Array(count);
      const ratio = Math.log(maxHz / minHz);
      for (let i = 0; i < count; i++) {
        const f0 = minHz * Math.exp((ratio * i) / count);
        const f1 = minHz * Math.exp((ratio * (i + 1)) / count);
        let b0 = Math.floor(f0 / binHz);
        let b1 = Math.ceil(f1 / binHz);
        b0 = Math.max(1, Math.min(bins - 1, b0));
        b1 = Math.max(b0 + 1, Math.min(bins, b1));
        lo[i] = b0;
        hi[i] = b1;
      }
      st = {
        values: new Float32Array(count),
        peaks: new Float32Array(count),
        holds: new Float32Array(count),
        lo,
        hi,
        key,
      };
      this.barStates.set(key, st);
    }
    for (let i = 0; i < count; i++) {
      let max = 0;
      for (let b = st.lo[i]!; b < st.hi[i]!; b++) {
        const v = this.freq[b]!;
        if (v > max) max = v;
      }
      let v = max / 255;
      if (tilt) {
        // gentle high-frequency boost so bars are visually balanced
        const t = i / Math.max(1, count - 1);
        v = Math.min(1, v * (0.85 + 0.55 * t));
      }
      const prev = st.values[i]!;
      const k = v > prev ? attack : release;
      const nv = prev + (v - prev) * k;
      st.values[i] = nv;
      if (nv >= st.peaks[i]!) {
        st.peaks[i] = nv;
        st.holds[i] = hold;
      } else if (st.holds[i]! > 0) {
        st.holds[i] = st.holds[i]! - dt;
      } else {
        st.peaks[i] = Math.max(nv, st.peaks[i]! - fall * dt);
      }
    }
    return { values: st.values, peaks: st.peaks };
  }
}
