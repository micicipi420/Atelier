import { describe, expect, it } from 'vitest';
import { Analyzer, adjustRateToFPS } from '../src/audio/analysis';

class FakeAnalyser {
  constructor(
    private freq: Uint8Array,
    private wave: Float32Array,
  ) {}
  getByteFrequencyData(out: Uint8Array) {
    out.set(this.freq.subarray(0, out.length));
  }
  getFloatFrequencyData(out: Float32Array) {
    for (let i = 0; i < out.length; i++) out[i] = -100 + (this.freq[i]! / 255) * 90;
  }
  getFloatTimeDomainData(out: Float32Array) {
    out.set(this.wave.subarray(0, out.length));
  }
}

function sine(freqHz: number, n: number, sr: number, amp = 0.5): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / sr);
  return out;
}

describe('adjustRateToFPS', () => {
  it('is identity at the base fps and stronger at lower fps', () => {
    expect(adjustRateToFPS(0.9, 30, 30)).toBeCloseTo(0.9);
    expect(adjustRateToFPS(0.9, 30, 60)).toBeCloseTo(Math.sqrt(0.9));
    expect(adjustRateToFPS(0.9, 30, 15)).toBeCloseTo(0.81);
  });
});

describe('Analyzer', () => {
  const sr = 44100;
  const fft = 2048;
  it('produces a silent but valid frame without an analyser', () => {
    const a = new Analyzer(fft);
    const f = a.capture(null, null, null, sr, false, 1);
    expect(f.freq.length).toBe(fft / 2);
    expect(f.wave.length).toBe(fft);
    expect(f.rms).toBe(0);
    expect(f.beat).toBe(false);
    expect(f.bars(16).values.length).toBe(16);
  });

  it('maps a 1 kHz peak into the right log bar', () => {
    const freq = new Uint8Array(fft / 2);
    const bin = Math.round((1000 * fft) / sr);
    freq[bin] = 255;
    const a = new Analyzer(fft);
    const an = new FakeAnalyser(freq, sine(1000, fft, sr)) as unknown as AnalyserNode;
    let frame = a.capture(an, null, null, sr, true, 1);
    for (let t = 2; t < 10; t++) frame = a.capture(an, null, null, sr, true, t / 60);
    const bars = frame.bars(24, { minHz: 35, maxHz: 16000, attack: 1, tilt: false });
    let best = 0;
    for (let i = 1; i < 24; i++) if (bars.values[i]! > bars.values[best]!) best = i;
    // bar i covers 35 * (16000/35)^(i/24) … ; 1 kHz lands in bar 13
    const expected = Math.floor((Math.log(1000 / 35) / Math.log(16000 / 35)) * 24);
    expect(best).toBe(expected);
    expect(bars.peaks[best]!).toBeGreaterThanOrEqual(bars.values[best]!);
  });

  it('computes RMS and MilkDrop-style bands', () => {
    const freq = new Uint8Array(fft / 2).fill(120);
    const a = new Analyzer(fft);
    const an = new FakeAnalyser(freq, sine(100, fft, sr, 0.5)) as unknown as AnalyserNode;
    let f = a.capture(an, null, null, sr, true, 1);
    for (let t = 2; t < 80; t++) f = a.capture(an, null, null, sr, true, t / 60);
    expect(f.rms).toBeCloseTo(0.5 / Math.SQRT2, 2);
    // a steady signal settles towards 1.0 relative to its long-term average
    expect(f.bands.bass).toBeGreaterThan(0.8);
    expect(f.bands.bass).toBeLessThan(1.3);
    expect(f.bands.bassAtt).toBeGreaterThan(0.8);
    expect(f.binHz(1)).toBeCloseTo(sr / fft);
  });

  it('detects a beat when bass energy jumps after a quiet stretch', () => {
    const quiet = new Uint8Array(fft / 2).fill(10);
    const loud = new Uint8Array(fft / 2);
    for (let i = 0; i < 20; i++) loud[i] = 250;
    const a = new Analyzer(fft);
    const silence = new Float32Array(fft);
    const qa = new FakeAnalyser(quiet, silence) as unknown as AnalyserNode;
    const la = new FakeAnalyser(loud, sine(60, fft, sr, 0.8)) as unknown as AnalyserNode;
    let beats = 0;
    for (let t = 1; t < 60; t++) if (a.capture(qa, null, null, sr, true, t / 60).beat) beats++;
    expect(beats).toBe(0);
    let hit = false;
    for (let t = 60; t < 66; t++) if (a.capture(la, null, null, sr, true, t / 60).beat) hit = true;
    expect(hit).toBe(true);
  });
});
