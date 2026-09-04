/**
 * Synthesises a short demo track with OfflineAudioContext so the player is
 * usable (and testable) without any local music. Encoded as 16-bit WAV.
 */
import type { Track } from './types';
import { trackFromFile } from './loader';

export function encodeWav(buffers: Float32Array[], sampleRate: number): Blob {
  const channels = buffers.length;
  const frames = buffers[0]!.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, buffers[c]![i]!));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

const NOTE = (semitone: number) => 440 * Math.pow(2, (semitone - 69) / 12);

/** A 32-second synthwave-ish loop at 124 BPM with kick, hats, bass, pad and lead. */
export async function synthesizeDemo(seconds = 32, sampleRate = 44100): Promise<Blob> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);

  const bpm = 124;
  const beat = 60 / bpm;
  const bars = Math.floor(seconds / (beat * 4));

  // kick: pitched sine drop
  for (let b = 0; b < bars * 4; b++) {
    const t = b * beat;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.4);
  }
  // hats: filtered noise on 8ths, accent on off-beats
  const noiseBuf = ctx.createBuffer(1, sampleRate, sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  for (let s = 0; s < bars * 8; s++) {
    const t = s * beat * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    const accent = s % 2 === 1 ? 0.35 : 0.18;
    g.gain.setValueAtTime(accent, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (s % 4 === 2 ? 0.18 : 0.06));
    src.connect(hp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.2);
  }
  // bass: 16th-note pattern, saw through lowpass
  const bassNotes = [33, 33, 45, 33, 36, 36, 48, 36, 31, 31, 43, 31, 38, 38, 50, 38];
  for (let s = 0; s < bars * 16; s++) {
    const t = s * beat * 0.25;
    const note = bassNotes[s % 16]!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = NOTE(note);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
    osc.connect(lp).connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.25);
  }
  // pad: detuned chords, slow filter, stereo spread
  const chords = [
    [57, 60, 64, 67],
    [55, 59, 62, 67],
    [53, 57, 60, 64],
    [50, 53, 57, 62],
  ];
  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % 4]!;
    const t = bar * beat * 4;
    for (let i = 0; i < chord.length; i++) {
      for (const det of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = NOTE(chord[i]!);
        osc.detune.value = det;
        const pan = ctx.createStereoPanner();
        pan.pan.value = det < 0 ? -0.6 : 0.6;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.linearRampToValueAtTime(2200, t + beat * 2);
        lp.frequency.linearRampToValueAtTime(500, t + beat * 4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.3);
        g.gain.setValueAtTime(0.045, t + beat * 4 - 0.2);
        g.gain.linearRampToValueAtTime(0, t + beat * 4);
        osc.connect(lp).connect(g).connect(pan).connect(master);
        osc.start(t);
        osc.stop(t + beat * 4 + 0.05);
      }
    }
  }
  // lead: arpeggio from bar 4 with vibrato and echo
  const delay = ctx.createDelay(1);
  delay.delayTime.value = beat * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  delay.connect(fb).connect(delay);
  delay.connect(master);
  const leadNotes = [76, 79, 83, 84, 83, 79, 76, 72, 74, 77, 81, 79, 77, 74, 72, 71];
  for (let s = 16; s < bars * 8; s++) {
    if (s % 8 === 7 && Math.floor(s / 8) % 2 === 1) continue;
    const t = s * beat * 0.5;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = NOTE(leadNotes[s % 16]!);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6;
    const vibG = ctx.createGain();
    vibG.gain.value = 5;
    vib.connect(vibG).connect(osc.detune);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(lp).connect(g);
    g.connect(master);
    g.connect(delay);
    osc.start(t);
    vib.start(t);
    osc.stop(t + 0.45);
    vib.stop(t + 0.45);
  }
  const rendered = await ctx.startRendering();
  return encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], sampleRate);
}

/** Stereo test tone: Lissajous-friendly (L 220 Hz, R 330 Hz with slow phase drift). */
export async function synthesizeStereoTone(seconds = 20, sampleRate = 44100): Promise<Blob> {
  const frames = seconds * sampleRate;
  const L = new Float32Array(frames);
  const R = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    const env = 0.5 * (1 - Math.exp(-t * 3));
    L[i] = env * Math.sin(2 * Math.PI * 220 * t) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.25 * t));
    R[i] = env * Math.sin(2 * Math.PI * 330 * t + 0.4 * Math.sin(2 * Math.PI * 0.1 * t));
  }
  return encodeWav([L, R], sampleRate);
}

export async function demoTracks(): Promise<Track[]> {
  const [a, b] = await Promise.all([synthesizeDemo(), synthesizeStereoTone()]);
  const t1 = trackFromFile(new File([a], 'Lumina - Neon Drive (demo).wav', { type: 'audio/wav' }));
  t1.artist = 'Lumina';
  t1.title = 'Neon Drive (demo)';
  t1.album = 'Built-in demos';
  t1.tagged = true;
  const t2 = trackFromFile(new File([b], 'Lumina - Lissajous (demo).wav', { type: 'audio/wav' }));
  t2.artist = 'Lumina';
  t2.title = 'Lissajous (demo)';
  t2.album = 'Built-in demos';
  t2.tagged = true;
  return [t1, t2];
}
