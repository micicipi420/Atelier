/**
 * Feedback engine for the Windows Media Player "Ambience family" look
 * (Ambience, Battery, Alchemy, Plenoptic, Musical Colors): every frame the
 * previous frame is displaced by a "shift" (video feedback), decayed, and new
 * "ink" is drawn on top in a palette colour. That is exactly how WMP's Battery
 * described its presets (CurrentShift / PreShift / PaletteLocked).
 *
 * Ported to raw WebGL2 from Now Playing (MIT, Manaiakalani,
 * src/vis/renderer/feedback.ts + audio/features.ts), with extra shift/draw
 * modes for presets it did not cover.
 */
import type { AudioFrame } from '../../audio/analysis';
import { DataTexture, PingPong, QUAD_VS, bindTex, createProgram, drawQuad, getGL } from '../gl/glutil';
import type { VisContext, VisInstance } from '../types';

export interface FeedbackPreset {
  id: string;
  name: string;
  /** displacement mode 0..19 */
  shift: number;
  /** ink drawer 0..19 */
  draw: number;
  decay: number;
  paletteLocked: boolean;
  palette: string[];
  hueSpeed: number;
  shiftStrength: number;
  ink: number;
  flashOnBeat: boolean;
  kaleidoSlices: number;
  seed: number;
  /** "Random"/"Randomization": cycle through the other presets */
  random?: boolean;
}

export const FEEDBACK_FS = `#version 300 es
precision highp float;
uniform sampler2D tPrev;
uniform sampler2D tFreq;
uniform sampler2D tWave;
uniform sampler2D tPalette;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uRms;
uniform float uBeat;
uniform float uShift;
uniform float uDraw;
uniform float uDecay;
uniform float uHueShift;
uniform float uShiftStrength;
uniform float uInk;
uniform float uFlash;
uniform float uKaleidoSlices;
uniform float uSeed;
uniform float uPaletteLocked;
uniform float uDrift;
uniform float uPlaying;
uniform float uLoud;
uniform float uFade;
in vec2 vUv;
out vec4 frag;

float freqAt(float t) { return texture(tFreq, vec2(clamp(t, 0.001, 0.999), 0.5)).r; }
float waveAt(float t) { return texture(tWave, vec2(clamp(t, 0.001, 0.999), 0.5)).r * 2.0 - 1.0; }
vec2 rotate(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

vec2 applyShift(vec2 uv) {
  vec2 p = uv - 0.5;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  p.x *= aspect;
  float s = uShiftStrength * 0.55;
  float r = length(p);
  float a = atan(p.y, p.x);
  a += uTime * 0.04 * uDrift;
  r *= 0.996;
  if (uShift < 0.5) {            // swirl
    a += r * (0.55 + uBass * 0.35) * s + uTime * 0.05;
    r *= 0.994;
    p = vec2(cos(a), sin(a)) * r;
  } else if (uShift < 1.5) {     // kaleidoscope
    float slices = max(uKaleidoSlices, 3.0);
    float seg = 6.2831853 / slices;
    a = mod(a, seg);
    a = abs(a - seg * 0.5);
    r *= 0.995;
    p = vec2(cos(a), sin(a)) * r;
    p = rotate(p, uTime * 0.03);
  } else if (uShift < 2.5) {     // radial push
    p += normalize(p + 0.0001) * (0.012 * s * (0.6 + uBass * 0.3)) * sin(a * 3.0 + uTime * 0.4);
    p *= 0.995;
  } else if (uShift < 3.5) {     // zoom in
    p *= 0.988 - uBass * 0.01 * s;
  } else if (uShift < 4.5) {     // tiling
    float tiles = 3.0 + floor(uSeed * 2.0);
    p = (fract(p * tiles + 0.5) - 0.5) / tiles;
    p *= 0.985;
    p = rotate(p, uTime * 0.025);
  } else if (uShift < 5.5) {     // ripple
    a += sin(r * 3.0 - uTime * 0.35) * 0.18 * s;
    r *= 0.994;
    p = vec2(cos(a), sin(a)) * r;
  } else if (uShift < 6.5) {     // twist
    p = rotate(p, 0.22 * s * (0.35 - r) + uTime * 0.03);
    p *= 0.995;
  } else if (uShift < 7.5) {     // scroll up
    p.y += 0.008 * s;
  } else if (uShift < 8.5) {     // scroll down
    p.y -= 0.008 * s;
  } else if (uShift < 9.5) {     // scroll left
    p.x -= 0.008 * s;
  } else if (uShift < 10.5) {    // scroll right
    p.x += 0.008 * s;
  } else if (uShift < 11.5) {    // spiral
    float t = a + r * 1.8 + uTime * 0.08 + uSeed;
    r = pow(max(r, 0.0001), 1.03);
    p = vec2(cos(t), sin(t)) * r * 0.992;
  } else if (uShift < 12.5) {    // bass zoom
    p *= 0.99 - uBass * 0.008;
  } else if (uShift < 13.5) {    // wave warp
    p.x += sin(p.y * 3.5 + uTime * 0.35) * 0.004 * s;
    p.y += cos(p.x * 3.0 - uTime * 0.25) * 0.004 * s;
    p *= 0.988;
  } else if (uShift < 14.5) {    // sine drift
    p += 0.004 * s * vec2(sin(uv.y * 6.0 + uTime * 0.3), cos(uv.x * 5.0 - uTime * 0.25));
    p *= 0.995;
  } else if (uShift < 15.5) {    // funnel
    p.y += 0.01 * s * smoothstep(0.15, 0.7, r);
    p *= 0.994;
  } else if (uShift < 16.5) {    // breathe
    p *= 0.99 + 0.006 * sin(a * 2.0 + uTime * 0.3);
  } else if (uShift < 17.5) {    // rotate
    a += uTime * 0.06 * s;
    r *= 0.995;
    p = vec2(cos(a), sin(a)) * r;
  } else if (uShift < 18.5) {    // lateral flow that reverses when loud (Ambience Anon/Dizzy/Blender)
    p.x += (uLoud > 0.5 ? -0.009 : 0.009) * s;
    p.y += 0.002 * s * sin(p.x * 4.0 + uTime * 0.5);
    p *= 0.997;
  } else {                       // drain: spiral inwards
    a += (0.18 + uBass * 0.1) * s * (0.6 - r);
    r *= 0.985;
    p = vec2(cos(a), sin(a)) * r;
  }
  p.x /= aspect;
  return p + 0.5;
}

float inject(vec2 uv) {
  if (uPlaying < 0.5) return 0.0;
  vec2 p = uv - 0.5;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  p.x *= aspect;
  float r = length(p);
  float a = atan(p.y, p.x);
  float ink = 0.0;
  float energy = uRms * 0.55 + uBass * 0.35;
  if (uDraw < 0.5) {             // five orbiting blobs
    float blob = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float ang = fi * 1.2566 + uTime * 0.08 + uSeed;
      float rad = 0.14 + 0.05 * sin(uTime * 0.12 + fi) + uBass * 0.08;
      vec2 c = vec2(cos(ang), sin(ang)) * rad;
      float d = length(p - c);
      float w = 0.11 + uRms * 0.05;
      blob += smoothstep(w, 0.0, d);
    }
    ink = blob * 0.8;
  } else if (uDraw < 1.5) {      // ring
    float ring = abs(r - (0.24 + uBass * 0.08));
    ink = smoothstep(0.07, 0.0, ring) * (0.6 + energy);
  } else if (uDraw < 2.5) {      // radar sweep
    float sweep = abs(fract(a / 6.28318 - uTime * 0.04) - 0.5);
    ink = smoothstep(0.1, 0.0, 0.5 - sweep) * (0.9 + energy * 0.5);   // a thin bright sweeping wedge
    ink += smoothstep(0.05, 0.0, abs(r - 0.32)) * 0.25;
  } else if (uDraw < 3.5) {      // dot grid
    vec2 g = fract(p * 10.0) - 0.5;
    ink = smoothstep(0.16, 0.02, length(g)) * (0.8 + uBass * 0.8);
  } else if (uDraw < 4.5) {      // five-arm burst
    float burst = 0.0;
    for (int i = 0; i < 5; i++) {
      float ang = float(i) * 1.2566 + uTime * 0.12;
      vec2 dir = vec2(cos(ang), sin(ang));
      float proj = clamp(dot(p, dir), 0.0, 0.5);
      burst += smoothstep(0.035, 0.0, length(p - dir * proj));
    }
    ink = burst * (0.5 + energy * 0.5);
  } else if (uDraw < 5.5) {      // edge frame
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    ink = smoothstep(0.08, 0.0, edge) * (0.7 + energy * 0.6);
  } else if (uDraw < 6.5) {      // edge frame (mid driven)
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    ink = smoothstep(0.07, 0.0, edge) * (0.65 + uMid * 0.7);
  } else if (uDraw < 7.5) {      // sparkle grid
    vec2 gp = p * 6.0;
    vec2 f = fract(gp) - 0.5;
    float n = 0.35 + 0.65 * fract(sin(dot(floor(gp), vec2(12.7, 78.2)) + uSeed) * 43758.5);
    float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + n * 40.0);
    ink = smoothstep(0.13, 0.0, length(f)) * n * (0.5 + 0.5 * twinkle) * (1.2 + uTreble);
  } else if (uDraw < 8.5) {      // floor rise
    float h = 0.15 + uBass * 0.35 + uRms * 0.2;
    ink = smoothstep(h + 0.08, h, uv.y) * (0.2 + h * 0.6);
  } else if (uDraw < 9.5) {      // smoke
    float smoke = 0.5 + 0.5 * sin(r * 4.0 - uTime * 0.2 + a);
    ink = smoke * smoothstep(0.55, 0.1, r) * (0.4 + energy * 0.4);
  } else if (uDraw < 10.5) {     // ribbon
    float ribbon = sin(p.x * 2.4 + uTime * 0.2) * (0.08 + uMid * 0.06);
    ink = smoothstep(0.05, 0.0, abs(p.y - ribbon)) * (0.7 + energy * 0.3);
  } else if (uDraw < 11.5) {     // oscilloscope waveform
    float w = waveAt(uv.x) * (0.12 + uRms * 0.1);
    ink = smoothstep(0.04, 0.0, abs(p.y - w)) * 1.0;
  } else if (uDraw < 12.5) {     // bass bar
    float h = 0.12 + uBass * 0.4;
    ink = (uv.y < h) ? 0.35 + h * 0.5 : 0.0;
  } else if (uDraw < 13.5) {     // wobble ring
    float wobble = 0.24 + uBass * 0.1;
    ink = smoothstep(0.04, 0.0, abs(r - wobble)) * 0.45;
  } else if (uDraw < 14.5) {     // facets
    vec2 q = rotate(p, 0.5);
    float facet = abs(sin(q.x * 6.0) * sin(q.y * 5.0));
    ink = pow(facet, 4.0) * (0.5 + uTreble * 0.5);
  } else if (uDraw < 15.5) {     // lane
    float lane = abs(p.y + 0.08 * sin(p.x * 2.0 + uTime * 0.15));
    ink = smoothstep(0.05, 0.0, lane) * (0.9 + energy * 0.4);
  } else if (uDraw < 16.5) {     // X marks the spot: two diagonal waveform lines
    vec2 q = rotate(p, 0.7853982);
    float w1 = waveAt(uv.x) * (0.08 + uRms * 0.08);
    float w2 = waveAt(uv.y) * (0.08 + uRms * 0.08);
    ink = smoothstep(0.035, 0.0, abs(q.y - w1)) * 0.9 + smoothstep(0.035, 0.0, abs(q.x - w2)) * 0.9;
  } else if (uDraw < 17.5) {     // windmill: four rotating blades
    float blades = abs(sin((a + uTime * (0.5 + uBass)) * 2.0));
    ink = pow(blades, 12.0) * smoothstep(0.55, 0.05, r) * (0.9 + energy * 0.6);
  } else if (uDraw < 18.5) {     // bubbles rising
    float bub = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float x = fract(sin(fi * 12.9898 + uSeed * 7.0) * 43758.5) - 0.5;
      float y = fract(uTime * (0.05 + fi * 0.012) + fi * 0.17) - 0.5;
      float d = length(p - vec2(x * aspect * 0.9, y));
      float rad = 0.03 + 0.03 * fract(fi * 0.37) + uBass * 0.03;
      bub += smoothstep(0.012, 0.0, abs(d - rad));
    }
    ink = bub * (1.3 + energy * 0.5);
  } else {                       // two lines that swap when loud (Down the Drain)
    float sw = uLoud > 0.5 ? -1.0 : 1.0;
    float l1 = abs(p.y - sw * (0.15 + 0.05 * sin(uTime * 0.3)) - waveAt(uv.x) * 0.05);
    float l2 = abs(p.y + sw * (0.15 + 0.05 * cos(uTime * 0.27)) - waveAt(1.0 - uv.x) * 0.05);
    ink = (smoothstep(0.03, 0.0, l1) + smoothstep(0.03, 0.0, l2)) * (0.7 + energy * 0.3);
  }
  // wide-area drawers (radar, edges, floor, smoke, bass bar, facets, windmill) get less ink so they wash less
  bool wide = (uDraw > 1.5 && uDraw < 2.5) || (uDraw > 4.5 && uDraw < 6.5) || (uDraw > 7.5 && uDraw < 9.5) || (uDraw > 11.5 && uDraw < 12.5) || (uDraw > 13.5 && uDraw < 14.5) || (uDraw > 16.5 && uDraw < 17.5);
  return ink * (wide ? 0.6 : 1.0);
}

void main() {
  vec2 uvShift = applyShift(vUv);
  // the originals were darker towards the edges: extra decay there keeps washes from filling the frame
  vec2 vp = (vUv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float vign = 1.0 - 0.05 * smoothstep(0.4, 0.9, length(vp));
  // multiplicative decay plus a small subtractive fade (like a palette index counting down) so dim washes die out
  // outside the frame: mirror back inside (clamping would smear border pixels inwards forever,
  // black would cut rotations into a disc)
  vec2 m = uvShift;
  if (m.x < 0.0) m.x = -m.x;
  if (m.x > 1.0) m.x = 2.0 - m.x;
  if (m.y < 0.0) m.y = -m.y;
  if (m.y > 1.0) m.y = 2.0 - m.y;
  vec3 src = texture(tPrev, clamp(m, 0.0, 1.0)).rgb;
  vec3 prev = max(src * uDecay * vign - uFade, 0.0);
  float ink = inject(vUv) * uInk;
  float look;
  // ink comes from the brighter half of the palette (index 0-1 are the dark background tones)
  if (uPaletteLocked > 0.5) look = clamp(0.5 + uHueShift * 0.12 + uBass * 0.3, 0.3, 0.98);
  else look = fract(0.5 + uHueShift * 0.35 + uBass * 0.2);
  vec3 inkCol = texture(tPalette, vec2(look, 0.5)).rgb;
  // ink only fills the remaining headroom so feedback can never white out
  float head = 1.0 - max(prev.r, max(prev.g, prev.b));
  vec3 col = prev + inkCol * ink * head;
  col = mix(col, vec3(1.0), uFlash * 0.3);
  frag = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const COPY_FS = `#version 300 es
precision highp float;
uniform sampler2D tMap;
in vec2 vUv;
out vec4 frag;
void main() {
  vec3 c = texture(tMap, vUv).rgb;
  // mild contrast curve so washes stay dark and ink pops (the originals ran in 8-bit palettes)
  c = pow(c, vec3(1.3));
  frag = vec4(c, 1.0);
}`;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function writePalette(colors: string[], out: Uint8Array): void {
  const parsed = (colors.length ? colors : ['#000000', '#ffffff']).map(hexToRgb);
  const w = 256;
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);
    const x = t * (parsed.length - 1);
    const a = Math.floor(x);
    const b = Math.min(parsed.length - 1, a + 1);
    const f = x - a;
    const ca = parsed[a]!;
    const cb = parsed[b]!;
    out[i * 3] = Math.round(ca[0] * (1 - f) + cb[0] * f);
    out[i * 3 + 1] = Math.round(ca[1] * (1 - f) + cb[1] * f);
    out[i * 3 + 2] = Math.round(ca[2] * (1 - f) + cb[2] * f);
  }
}

/** Soft-knee compressor (CAVA autosens idea). */
const compress = (x: number) => (x < 0 ? 0 : x / (0.62 + x));
/** MilkDrop-style lag: rise fast, fall slower. */
const attenuate = (cur: number, next: number) => (next > cur ? cur * 0.78 + next * 0.22 : cur * 0.9 + next * 0.1);

export class FeedbackEngine {
  private prog: WebGLProgram;
  private copy: WebGLProgram;
  private pp: PingPong;
  private palTex: WebGLTexture;
  private palBytes = new Uint8Array(256 * 3);
  private paletteKey = '';
  private freqTex: DataTexture;
  private waveTex: DataTexture;
  private freqBuf = new Uint8Array(512);
  private waveBuf = new Float32Array(1024);
  private env = { bass: 0, mid: 0, treble: 0, rms: 0, pulse: 0, loud: 0 };
  private time = 0;
  private hue = 0;
  private u = new Map<string, WebGLUniformLocation | null>();
  /** honour the OS reduced-motion preference: gentler warps, faster fade (Now Playing's safety rule) */
  private reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  width: number;
  height: number;

  constructor(
    private gl: WebGL2RenderingContext,
    w: number,
    h: number,
  ) {
    this.width = w;
    this.height = h;
    this.prog = createProgram(gl, QUAD_VS, FEEDBACK_FS);
    this.copy = createProgram(gl, QUAD_VS, COPY_FS);
    this.pp = new PingPong(gl, w, h, false);
    this.freqTex = new DataTexture(gl, 512);
    this.waveTex = new DataTexture(gl, 1024);
    this.palTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 256, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, this.palBytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    const k = (p === this.prog ? 'f:' : 'c:') + name;
    if (!this.u.has(k)) this.u.set(k, this.gl.getUniformLocation(p, name));
    return this.u.get(k) ?? null;
  }
  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.pp.resize(w, h);
  }
  dispose(): void {
    const gl = this.gl;
    this.pp.dispose();
    this.freqTex.dispose();
    this.waveTex.dispose();
    gl.deleteTexture(this.palTex);
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.copy);
  }

  private updateAudio(frame: AudioFrame): void {
    const freq = frame.freq;
    let bass = 0;
    let bn = 0;
    let mid = 0;
    let mn = 0;
    let treb = 0;
    let tn = 0;
    for (let i = 1; i < freq.length; i++) {
      const hz = frame.binHz(i);
      const v = freq[i]! / 255;
      if (hz < 150) {
        bass += v;
        bn++;
      } else if (hz < 2000) {
        mid += v;
        mn++;
      } else if (hz < 12000) {
        treb += v;
        tn++;
      }
    }
    const e = this.env;
    e.bass = attenuate(e.bass, compress(bn ? bass / bn : 0));
    e.mid = attenuate(e.mid, compress(mn ? mid / mn : 0));
    e.treble = attenuate(e.treble, compress(tn ? treb / tn : 0));
    e.rms = attenuate(e.rms, compress(frame.rms * 2.6));
    const energy = compress(frame.rms * 2.2 + (bn ? bass / bn : 0) * 0.35);
    if (energy > e.pulse) e.pulse = e.pulse * 0.82 + energy * 0.18;
    else e.pulse *= Math.exp(-1.2 * frame.dt);
    // "loud" latch used by Ambience presets that reverse direction / swap lines
    const loudTarget = frame.level > 0.55 ? 1 : 0;
    e.loud += (loudTarget - e.loud) * (loudTarget > e.loud ? 0.2 : 0.02);

    // frequency texture with t*t warp (more resolution in the bass) — as Now Playing
    const n = freq.length;
    for (let i = 0; i < 512; i++) {
      const t = i / 511;
      const idx = t * t * (n - 1);
      const a = Math.floor(idx);
      const f = idx - a;
      const va = freq[a] ?? 0;
      const vb = freq[Math.min(n - 1, a + 1)] ?? 0;
      this.freqBuf[i] = Math.round(va * (1 - f) + vb * f);
    }
    this.freqTex.uploadBytes(this.freqBuf);
    const wave = frame.wave;
    for (let i = 0; i < 1024; i++) this.waveBuf[i] = wave[Math.floor((i / 1024) * wave.length)] ?? 0;
    this.waveTex.upload(this.waveBuf, true);
  }

  /** Advance one frame with `preset` and present it to the default framebuffer at (outW, outH). */
  frame(frame: AudioFrame, preset: FeedbackPreset, outW: number, outH: number): void {
    const gl = this.gl;
    const playing = frame.active;
    const dt = frame.dt;
    this.updateAudio(frame);
    this.time += dt * (playing ? 1 : 0.15);
    if (playing) this.hue += (preset.paletteLocked ? preset.hueSpeed * 0.08 : preset.hueSpeed * 0.35) * dt;

    const key = preset.palette.join(',');
    if (key !== this.paletteKey) {
      writePalette(preset.palette, this.palBytes);
      gl.bindTexture(gl.TEXTURE_2D, this.palTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGB, gl.UNSIGNED_BYTE, this.palBytes);
      this.paletteKey = key;
    }

    let decay: number;
    let ink: number;
    let shift: number;
    if (!playing) {
      decay = 0.93;
      ink = 0;
      shift = preset.shiftStrength * 0.08;
    } else {
      decay = Math.min(0.97, preset.decay);
      ink = preset.ink * 0.6;
      shift = preset.shiftStrength * (0.7 + this.env.bass * 0.08);
    }
    if (this.reduced) {
      decay = Math.min(0.9, decay);
      shift *= 0.3;
      ink *= playing ? 0.55 : 0;
    }
    const flash = preset.flashOnBeat && playing && !this.reduced ? frame.beatEnergy * Math.min(1, this.env.rms * 1.4) : 0;

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pp.write.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.prog);
    bindTex(gl, 0, this.pp.read.tex, this.loc(this.prog, 'tPrev'));
    bindTex(gl, 1, this.freqTex.tex, this.loc(this.prog, 'tFreq'));
    bindTex(gl, 2, this.waveTex.tex, this.loc(this.prog, 'tWave'));
    bindTex(gl, 3, this.palTex, this.loc(this.prog, 'tPalette'));
    gl.uniform2f(this.loc(this.prog, 'uResolution'), this.width, this.height);
    gl.uniform1f(this.loc(this.prog, 'uTime'), this.time);
    gl.uniform1f(this.loc(this.prog, 'uBass'), this.env.bass);
    gl.uniform1f(this.loc(this.prog, 'uMid'), this.env.mid);
    gl.uniform1f(this.loc(this.prog, 'uTreble'), this.env.treble);
    gl.uniform1f(this.loc(this.prog, 'uRms'), this.env.rms);
    gl.uniform1f(this.loc(this.prog, 'uBeat'), this.env.pulse);
    gl.uniform1f(this.loc(this.prog, 'uShift'), preset.shift);
    gl.uniform1f(this.loc(this.prog, 'uDraw'), preset.draw);
    gl.uniform1f(this.loc(this.prog, 'uDecay'), decay);
    gl.uniform1f(this.loc(this.prog, 'uHueShift'), this.hue);
    gl.uniform1f(this.loc(this.prog, 'uShiftStrength'), shift);
    gl.uniform1f(this.loc(this.prog, 'uInk'), ink);
    gl.uniform1f(this.loc(this.prog, 'uFlash'), flash);
    gl.uniform1f(this.loc(this.prog, 'uKaleidoSlices'), preset.kaleidoSlices);
    gl.uniform1f(this.loc(this.prog, 'uSeed'), preset.seed);
    gl.uniform1f(this.loc(this.prog, 'uPaletteLocked'), preset.paletteLocked ? 1 : 0);
    gl.uniform1f(this.loc(this.prog, 'uDrift'), playing ? 0.16 : 0.03);
    gl.uniform1f(this.loc(this.prog, 'uPlaying'), playing ? 1 : 0);
    gl.uniform1f(this.loc(this.prog, 'uLoud'), this.env.loud);
    // subtractive fade scaled with the preset's decay: dim washes die, bright ink lingers
    gl.uniform1f(this.loc(this.prog, 'uFade'), playing ? (1 - decay) * 0.35 : 0.01);
    drawQuad(gl);
    this.pp.swap();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.copy);
    bindTex(gl, 0, this.pp.read.tex, this.loc(this.copy, 'tMap'));
    drawQuad(gl);
  }
}

/** Internal render size: the originals ran at ~400×300; keep it soft and fast. */
function internalSize(w: number, h: number): [number, number] {
  const maxDim = 900;
  const s = Math.min(1, maxDim / Math.max(w, h));
  return [Math.max(64, Math.round(w * s)), Math.max(64, Math.round(h * s))];
}

/** Generic VisInstance for a family of feedback presets. */
export class FeedbackVis implements VisInstance {
  private gl: WebGL2RenderingContext | null = null;
  private engine: FeedbackEngine | null = null;
  private preset = 0;
  private inner: FeedbackPreset | null = null;
  private innerClock = 0;
  private playClock = 0;

  constructor(
    private readonly presets: FeedbackPreset[],
    private readonly storageKey: string,
    private readonly randomEvery = 14,
  ) {}

  init(ctx: VisContext): void {
    const gl = getGL(ctx.canvas);
    this.gl = gl;
    const [w, h] = internalSize(ctx.canvas.width, ctx.canvas.height);
    this.engine = new FeedbackEngine(gl, w, h);
    try {
      const saved = parseInt(localStorage.getItem(this.storageKey) ?? '0', 10);
      if (saved >= 0 && saved < this.presets.length) this.preset = saved;
    } catch {
      /* ignore */
    }
  }
  resize(ctx: VisContext): void {
    const [w, h] = internalSize(ctx.canvas.width, ctx.canvas.height);
    this.engine?.resize(w, h);
  }
  destroy(): void {
    this.engine?.dispose();
    this.engine = null;
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
  presetCount(): number {
    return this.presets.length;
  }
  presetName(i = this.preset): string {
    const p = this.presets[i];
    if (!p) return '';
    if (p.random && this.inner && i === this.preset) return `${p.name} · ${this.inner.name}`;
    return p.name;
  }
  currentPreset(): number {
    return this.preset;
  }
  setPreset(i: number): void {
    this.preset = ((i % this.presets.length) + this.presets.length) % this.presets.length;
    this.inner = null;
    try {
      localStorage.setItem(this.storageKey, String(this.preset));
    } catch {
      /* ignore */
    }
  }
  private resolve(frame: AudioFrame): FeedbackPreset {
    const p = this.presets[this.preset]!;
    if (!p.random) return p;
    if (frame.active) this.playClock += frame.dt;
    if (!this.inner || this.playClock - this.innerClock > this.randomEvery) {
      const pool = this.presets.filter((q) => !q.random);
      if (pool.length) {
        let next = pool[Math.floor(Math.random() * pool.length)]!;
        if (pool.length > 1) while (next === this.inner) next = pool[Math.floor(Math.random() * pool.length)]!;
        this.inner = next;
      } else this.inner = p;
      this.innerClock = this.playClock;
    }
    return this.inner ?? p;
  }
  render(frame: AudioFrame, ctx: VisContext): void {
    if (!this.engine) return;
    const p = this.resolve(frame);
    this.engine.frame(frame, p, ctx.canvas.width, ctx.canvas.height);
  }
}
