// Writes WAV fixtures for the e2e test into e2e-out/ (not committed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'e2e-out');
mkdirSync(out, { recursive: true });
const sr = 44100;

function wav(chs, sampleRate) {
  const frames = chs[0].length, n = chs.length, dataSize = frames * n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(n, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * n * 2, 28); buf.writeUInt16LE(n * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < n; c++) { const s = Math.max(-1, Math.min(1, chs[c][i])); buf.writeInt16LE(Math.round(s < 0 ? s * 32768 : s * 32767), o); o += 2; }
  return buf;
}

// 20 s: kick at 120 BPM + bass + noise hats + a chord — enough energy across the spectrum
const secs = 20, frames = secs * sr;
const L = new Float32Array(frames), R = new Float32Array(frames);
for (let i = 0; i < frames; i++) {
  const t = i / sr, beat = t % 0.5, kick = Math.sin(2 * Math.PI * (150 * Math.exp(-beat * 18) + 40) * beat) * Math.exp(-beat * 9);
  const hat = (Math.random() * 2 - 1) * Math.exp(-((t + 0.25) % 0.5) * 40) * 0.25;
  const bass = Math.sign(Math.sin(2 * Math.PI * 55 * t)) * 0.18 * Math.exp(-((t % 0.25)) * 6);
  const chord = 0.08 * (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 554.37 * t) + Math.sin(2 * Math.PI * 659.25 * t));
  const lead = 0.1 * Math.sin(2 * Math.PI * (880 + 220 * Math.floor(t * 2) % 4) * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t));
  L[i] = kick * 0.8 + hat + bass + chord * 0.8 + lead * 0.6;
  R[i] = kick * 0.8 + hat * 0.8 + bass + chord * 1.2 + lead * 1.1;
}
writeFileSync(resolve(out, '01 - Fixture - Beat Test.wav'), wav([L, R], sr));

// 12 s: exponential sine sweep 40 Hz → 16 kHz for bar/spectrum checks
const sw = 12 * sr, S = new Float32Array(sw);
for (let i = 0; i < sw; i++) { const t = i / sw; const f = 40 * Math.pow(16000 / 40, t); S[i] = 0.5 * Math.sin(2 * Math.PI * f * (i / sr) / (1 + 0 * t)); }
writeFileSync(resolve(out, '02 - Fixture - Sweep.wav'), wav([S], sr));
console.log('fixtures written to', out);
