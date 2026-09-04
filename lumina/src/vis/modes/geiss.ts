/**
 * "Geiss" — a WebGL2 re-imagination of Ryan Geiss' 1998 Winamp plugin (the
 * original source is BSD-3-Clause; nothing is copied, the algorithm is
 * re-implemented): an 8-bit intensity frame is warped every tick through a
 * per-mode motion-vector field with bilinear weighting, audio-driven shapes
 * ("chasers", bars, dots, solar rays, grid, nuclide rings) are drawn on top,
 * and a 256-entry palette that morphs and cycles maps intensity to colour.
 */
import type { AudioFrame } from '../../audio/analysis';
import { PingPong, QUAD_VS, bindTex, createProgram, drawQuad, getGL } from '../gl/glutil';
import type { VisContext, VisInstance, VisualizerMode } from '../types';

/** Geiss ticks its warp at ~30 Hz; we simulate at that rate regardless of refresh. */
const WARP_HZ = 30;

const WARP_FS = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform int uMode;
uniform float uDamp;
uniform vec2 uAspect;
uniform float uTime;
uniform float uBass;
uniform float uSeed;
in vec2 vUv;
out vec4 frag;
void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uAspect;   // centred, aspect-corrected (x spans ±aspect)
  float r = length(p);
  float scale = 0.99;
  float turn = 0.0;
  if (uMode == 0) { scale = 0.99; }                                                   // flat zoom
  else if (uMode == 1) { scale = 0.9 - 0.10 * r; }                                    // typical tunnel
  else if (uMode == 2) { scale = 0.95 - 0.30 * r * r; }                               // tunnel #2
  else if (uMode == 3) { scale = 1.15 - (p.y + 1.0) * 0.20; }                         // terra
  else if (uMode == 4) { scale = min(1.05, 0.90 + 0.25 * r * r); }                    // sphere
  else if (uMode == 5) { scale = min(1.1, 0.90 + 0.15 * (abs(p.x) + abs(p.y))); }     // diamond
  else if (uMode == 6) { scale = min(1.1, 0.90 + 0.15 * (abs(p.x) - abs(p.y))); }     // hourglass
  else if (uMode == 7) { scale = 1.0 + 0.5 * abs(p.x); }                              // hall of mirrors
  else if (uMode == 8) { scale = 1.0 - 0.3 * abs(p.x) - 0.3 * abs(p.y) + 0.3 * r; }   // petals
  else if (uMode == 9) { scale = 0.95 - floor(r * 10.0) * 0.04; }                     // phonic rings
  else if (uMode == 10) { scale = 0.95 - mod(floor(r * 20.0), 4.0) * 0.12; }          // rings, quick fade
  else if (uMode == 11) { scale = 0.96; turn = 0.05; }                                // fast swirl
  else if (uMode == 12) { scale = 3.0 / (3.0 + r * 3.0); }                            // 1/r zoom
  else if (uMode == 13) { scale = 12.0 / (12.0 + r * 12.0); turn = 0.03 + 0.02 * sin(atan(p.x, p.y) * 3.0 + uSeed); } // sine-turn
  else if (uMode == 14) { scale = r > 0.5 ? 0.9 : 0.95; }                             // central sphere, edges cut
  else if (uMode == 15) { scale = 1.0 - 0.45 * r; }                                   // stretch-to-death
  else if (uMode == 16) { scale = 0.95 - floor(abs(p.x) * 10.0) * 0.03 - floor(abs(p.y) * 10.0) * 0.03; } // diced cube
  else if (uMode == 17) { turn = 0.3 * sin(p.x * 6.0); scale = 0.9 + 0.2 * cos(p.y * 6.0 + uSeed); } // split-world
  else if (uMode == 18) { scale = 0.97 + 0.03 * sin(r * 14.0 - uTime * 3.0); turn = 0.01 * sin(uTime); } // ripples
  scale = 1.0 + (scale - 1.0) * uDamp;
  turn *= uDamp;
  float c = cos(turn), s = sin(turn);
  vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c) * scale;
  vec2 uv = (q / uAspect) * 0.5 + 0.5;
  float v = 0.0;
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) v = texture(uPrev, uv).r;
  // palette-index style decay: brightness drifts down every tick
  v = v * 0.965 - 0.006 - 0.004 * (1.0 - uBass);
  frag = vec4(max(v, 0.0), 0.0, 0.0, 1.0);
}`;

const SHAPE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;   // x, y (aspect-corrected units), intensity
uniform vec2 uAspect;
uniform float uPointSize;
out float vI;
void main() {
  vI = aPos.z;
  gl_Position = vec4(aPos.xy / uAspect, 0.0, 1.0);
  gl_PointSize = uPointSize;
}`;

const SHAPE_FS = `#version 300 es
precision highp float;
in float vI;
out vec4 frag;
void main() { frag = vec4(vI, 0.0, 0.0, 1.0); }`;

const OUT_FS = `#version 300 es
precision highp float;
uniform sampler2D uAcc;
uniform sampler2D uPalette;
uniform float uShift;
in vec2 vUv;
out vec4 frag;
void main() {
  float v = texture(uAcc, vUv).r;
  // Geiss "palette ticks": bright pixels drift through the upper palette, dark ones stay dark
  float idx = v <= 0.002 ? 0.0 : clamp(v + uShift * v * 0.35, 0.0, 1.0);
  frag = vec4(texture(uPalette, vec2(idx, 0.5)).rgb, 1.0);
}`;

type Effect = 'chasers' | 'bars' | 'dots' | 'solar' | 'grid' | 'nuclide' | 'shade';

interface Preset {
  name: string;
  mode: number;
  effects: Effect[];
  auto?: boolean;
  dampened?: boolean;
}

const PRESETS: Preset[] = [
  { name: 'Auto (random modes)', mode: 0, effects: ['chasers'], auto: true },
  { name: 'Flat zoom · chasers', mode: 0, effects: ['chasers'] },
  { name: 'Tunnel · bars', mode: 1, effects: ['bars', 'chasers'] },
  { name: 'Fast swirl · dots', mode: 11, effects: ['dots', 'chasers'] },
  { name: 'Phonic rings · solar', mode: 9, effects: ['solar'] },
  { name: 'Sphere · grid', mode: 4, effects: ['grid', 'chasers'], dampened: true },
  { name: 'Hourglass · nuclide', mode: 6, effects: ['nuclide', 'chasers'] },
  { name: 'Hall of mirrors', mode: 7, effects: ['chasers', 'dots'] },
  { name: 'Split-world warp', mode: 17, effects: ['chasers'] },
  { name: 'Stretch zoom · shade', mode: 15, effects: ['shade', 'chasers'] },
  { name: '1/r zoom · solar', mode: 12, effects: ['solar', 'bars'] },
  { name: 'Ripples · nuclide', mode: 18, effects: ['nuclide', 'dots'] },
];

const ALL_EFFECTS: Effect[] = ['chasers', 'bars', 'dots', 'solar', 'grid', 'nuclide', 'shade'];
const DAMPENED_MODES = new Set([1, 2, 4, 5, 6, 7, 8, 13, 14, 16]);

function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

/** A Geiss-like palette: black at 0, then a few smooth hue/brightness key points. */
function randomPalette(): Float32Array {
  const keys: { pos: number; c: [number, number, number] }[] = [{ pos: 0, c: [0, 0, 0] }];
  const n = 3 + Math.floor(Math.random() * 3);
  const baseHue = Math.random();
  for (let i = 1; i <= n; i++) {
    const pos = i / n;
    const hue = (baseHue + (Math.random() - 0.5) * 0.35 + i * 0.13) % 1;
    const sat = 0.55 + Math.random() * 0.45;
    const val = Math.min(1, 0.35 + pos * 0.9 + Math.random() * 0.2);
    keys.push({ pos, c: hsv((hue + 1) % 1, sat, val) });
  }
  keys[keys.length - 1]!.c = [1, 1, Math.random() < 0.5 ? 1 : 0.8];
  const out = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = keys[0]!;
    let b = keys[keys.length - 1]!;
    for (let k = 0; k < keys.length - 1; k++) {
      if (t >= keys[k]!.pos && t <= keys[k + 1]!.pos) {
        a = keys[k]!;
        b = keys[k + 1]!;
        break;
      }
    }
    const f = b.pos === a.pos ? 0 : (t - a.pos) / (b.pos - a.pos);
    const s = f * f * (3 - 2 * f);
    out[i * 3] = a.c[0] + (b.c[0] - a.c[0]) * s;
    out[i * 3 + 1] = a.c[1] + (b.c[1] - a.c[1]) * s;
    out[i * 3 + 2] = a.c[2] + (b.c[2] - a.c[2]) * s;
  }
  return out;
}

export class GeissVis implements VisInstance {
  private gl: WebGL2RenderingContext | null = null;
  private warp!: WebGLProgram;
  private shape!: WebGLProgram;
  private out!: WebGLProgram;
  private pp: PingPong | null = null;
  private vbo!: WebGLBuffer;
  private vao!: WebGLVertexArrayObject;
  private palTex!: WebGLTexture;
  private verts = new Float32Array(3 * 4096);
  private palA = randomPalette();
  private palB = randomPalette();
  private palMix = 0;
  private palBytes = new Uint8Array(256 * 3);
  private shift = 0;
  private preset = 0;
  private mode = 0;
  private effects: Effect[] = ['chasers'];
  private seed = Math.random() * 6.28;
  private acc = 0;
  private nextSwitch = 0;
  private fbW = 0;
  private fbH = 0;
  private u = new Map<string, WebGLUniformLocation | null>();
  private chaserPhase = 0;

  init(ctx: VisContext): void {
    const gl = getGL(ctx.canvas);
    this.gl = gl;
    this.warp = createProgram(gl, QUAD_VS, WARP_FS);
    this.shape = createProgram(gl, SHAPE_VS, SHAPE_FS);
    this.out = createProgram(gl, QUAD_VS, OUT_FS);
    this.vbo = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    this.palTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 256, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, this.palBytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.allocate(ctx);
    try {
      const saved = parseInt(localStorage.getItem('lumina.geiss') ?? '0', 10);
      if (saved >= 0 && saved < PRESETS.length) this.preset = saved;
    } catch {
      /* ignore */
    }
    this.applyPreset();
  }
  private allocate(ctx: VisContext): void {
    // Geiss ran at 320×240..640×480; keep the buffer small so 1-px shapes read chunky
    const target = 640;
    const s = Math.min(1, target / Math.max(ctx.canvas.width, ctx.canvas.height));
    this.fbW = Math.max(64, Math.round(ctx.canvas.width * s));
    this.fbH = Math.max(64, Math.round(ctx.canvas.height * s));
    if (!this.pp) this.pp = new PingPong(this.gl!, this.fbW, this.fbH, false);
    else this.pp.resize(this.fbW, this.fbH);
  }
  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    const k = (p === this.warp ? 'w:' : p === this.shape ? 's:' : 'o:') + name;
    if (!this.u.has(k)) this.u.set(k, this.gl!.getUniformLocation(p, name));
    return this.u.get(k) ?? null;
  }
  resize(ctx: VisContext): void {
    this.allocate(ctx);
  }
  destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    this.pp?.dispose();
    gl.deleteProgram(this.warp);
    gl.deleteProgram(this.shape);
    gl.deleteProgram(this.out);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.palTex);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
  presetCount(): number {
    return PRESETS.length;
  }
  presetName(i = this.preset): string {
    const p = PRESETS[i];
    if (!p) return '';
    return p.auto ? `Auto · mode ${this.mode} · ${this.effects.join('+')}` : p.name;
  }
  currentPreset(): number {
    return this.preset;
  }
  setPreset(i: number): void {
    this.preset = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length;
    this.applyPreset();
    try {
      localStorage.setItem('lumina.geiss', String(this.preset));
    } catch {
      /* ignore */
    }
  }
  private applyPreset(): void {
    const p = PRESETS[this.preset]!;
    if (p.auto) this.randomMode();
    else {
      this.mode = p.mode;
      this.effects = p.effects;
    }
    this.nextSwitch = 0;
  }
  private randomMode(): void {
    this.mode = Math.floor(Math.random() * 19);
    const n = 1 + (Math.random() < 0.5 ? 1 : 0);
    const pool = ALL_EFFECTS.slice();
    this.effects = [];
    for (let i = 0; i < n; i++) this.effects.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
    if (!this.effects.includes('chasers') && Math.random() < 0.6) this.effects.push('chasers');
    this.seed = Math.random() * 6.28;
  }

  private buildShapes(frame: AudioFrame, aspect: [number, number]): { lines: number; points: number } {
    const v = this.verts;
    let n = 0;
    const put = (x: number, y: number, i: number) => {
      if (n + 3 > v.length) return;
      v[n++] = x;
      v[n++] = y;
      v[n++] = i;
    };
    const ax = aspect[0];
    const ay = aspect[1];
    const vol = Math.min(1.5, 0.4 + frame.level * 1.6);
    const bars = frame.bars(32, { minHz: 40, maxHz: 12000 });
    const wave = frame.wave;
    let lines = 0;

    for (const e of this.effects) {
      if (e === 'chasers') {
        // two waveform "chasers" that swing around the screen
        this.chaserPhase += frame.dt * 0.35;
        for (let c = 0; c < 2; c++) {
          const ang = this.chaserPhase + c * Math.PI;
          const cx = Math.cos(ang) * 0.35 * ax;
          const cy = Math.sin(ang * 0.7) * 0.35 * ay;
          const src = c === 0 ? frame.waveL : frame.waveR;
          const len = 0.9 * ax;
          const steps = 128;
          let px = 0;
          let py = 0;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const s = src[Math.floor(t * (src.length - 1))]! * 0.45 * vol;
            const x = cx + (t - 0.5) * len * Math.cos(ang * 0.3) - s * Math.sin(ang * 0.3);
            const y = cy + (t - 0.5) * len * Math.sin(ang * 0.3) + s * Math.cos(ang * 0.3);
            if (i > 0) {
              put(px, py, 1.0);
              put(x, y, 1.0);
              lines++;
            }
            px = x;
            py = y;
          }
        }
      } else if (e === 'bars') {
        for (let i = 0; i < 32; i++) {
          const x = -0.85 * ax + (i / 31) * 1.7 * ax;
          const h = bars.values[i]! * 0.8 * ay;
          put(x, 0, 0.55);
          put(x, h, 0.95);
          put(x, 0, 0.55);
          put(x, -h, 0.95);
          lines += 2;
        }
      } else if (e === 'solar') {
        const rays = 48;
        for (let i = 0; i < rays; i++) {
          const a = (i / rays) * Math.PI * 2 + frame.time * 0.2;
          const b = bars.values[i % 32]!;
          const r0 = 0.05 + frame.bands.bassAtt * 0.05;
          const r1 = r0 + 0.15 + b * 0.75;
          put(Math.cos(a) * r0, Math.sin(a) * r0, 0.7);
          put(Math.cos(a) * r1, Math.sin(a) * r1, 1.0);
          lines++;
        }
      } else if (e === 'nuclide') {
        const rings = 3;
        for (let k = 0; k < rings; k++) {
          const base = 0.15 + k * 0.22;
          const r = base * (0.85 + 0.35 * Math.min(1.6, frame.bands.bass) * 0.6);
          const segs = 64;
          for (let i = 0; i < segs; i++) {
            const a0 = (i / segs) * Math.PI * 2;
            const a1 = ((i + 1) / segs) * Math.PI * 2;
            const m0 = 1 + wave[(i * 8) % wave.length]! * 0.15;
            const m1 = 1 + wave[((i + 1) * 8) % wave.length]! * 0.15;
            put(Math.cos(a0) * r * m0, Math.sin(a0) * r * m0, 0.85 - k * 0.15);
            put(Math.cos(a1) * r * m1, Math.sin(a1) * r * m1, 0.85 - k * 0.15);
            lines++;
          }
        }
      } else if (e === 'shade') {
        // a fan of lines from the bottom whose brightness follows the spectrum
        for (let i = 0; i < 24; i++) {
          const t = i / 23;
          const x0 = (t - 0.5) * 1.6 * ax;
          const b = bars.values[Math.floor(t * 31)]!;
          put(x0, -0.95 * ay, 0.3 + b * 0.5);
          put(x0 * 0.2, -0.95 * ay + b * 1.5 * ay, 0.9);
          lines++;
        }
      }
    }
    const linesEnd = n;
    let points = 0;
    for (const e of this.effects) {
      if (e === 'dots') {
        for (let i = 0; i < 64; i++) {
          const b = bars.values[i % 32]!;
          const a = (i / 64) * Math.PI * 2 + frame.time * 0.5;
          const r = 0.2 + b * 0.7;
          put(Math.cos(a) * r * ax, Math.sin(a) * r * ay, 0.9);
          points++;
        }
      } else if (e === 'grid') {
        const bass = Math.min(1, frame.bands.bassAtt / 1.5);
        for (let y = -3; y <= 3; y++)
          for (let x = -4; x <= 4; x++) {
            const i = 0.35 + 0.6 * bass * (0.5 + 0.5 * Math.sin(frame.time * 4 + x * 0.7 + y * 0.9));
            put((x / 4) * 0.85 * ax, (y / 3) * 0.85 * ay, i);
            points++;
          }
      }
    }
    void linesEnd;
    return { lines, points };
  }

  render(frame: AudioFrame, ctx: VisContext): void {
    const gl = this.gl;
    if (!gl || !this.pp) return;
    const p = PRESETS[this.preset]!;
    // Geiss auto-switches modes every ~10-20 s
    if (p.auto && frame.active) {
      if (this.nextSwitch === 0) this.nextSwitch = frame.time + 12 + Math.random() * 10;
      if (frame.time > this.nextSwitch) {
        this.randomMode();
        this.nextSwitch = frame.time + 12 + Math.random() * 10;
        ctx.toast(this.presetName());
      }
    }
    const aspect: [number, number] = this.fbW > this.fbH ? [this.fbW / this.fbH, 1] : [1, this.fbH / this.fbW];
    const damp = p.dampened || DAMPENED_MODES.has(this.mode) ? 0.5 : 1.0;

    // palette morph + cycling
    this.palMix += frame.dt / 6;
    if (this.palMix >= 1) {
      this.palA = this.palB;
      this.palB = randomPalette();
      this.palMix = 0;
    }
    const m = this.palMix * this.palMix * (3 - 2 * this.palMix);
    for (let i = 0; i < 256 * 3; i++) this.palBytes[i] = Math.round((this.palA[i]! + (this.palB[i]! - this.palA[i]!) * m) * 255);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGB, gl.UNSIGNED_BYTE, this.palBytes);
    this.shift = 0.5 + 0.5 * Math.sin(frame.time * 0.4);

    // fixed-rate warp ticks
    this.acc += frame.dt;
    let ticks = Math.floor(this.acc * WARP_HZ);
    if (ticks > 2) ticks = 2;
    if (ticks > 0) this.acc -= ticks / WARP_HZ;
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, this.fbW, this.fbH);
    for (let t = 0; t < ticks; t++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pp.write.fbo);
      gl.useProgram(this.warp);
      bindTex(gl, 0, this.pp.read.tex, this.loc(this.warp, 'uPrev'));
      gl.uniform1i(this.loc(this.warp, 'uMode'), this.mode);
      gl.uniform1f(this.loc(this.warp, 'uDamp'), damp);
      gl.uniform2f(this.loc(this.warp, 'uAspect'), aspect[0], aspect[1]);
      gl.uniform1f(this.loc(this.warp, 'uTime'), frame.time);
      gl.uniform1f(this.loc(this.warp, 'uBass'), Math.min(1, frame.bands.bassAtt / 1.6));
      gl.uniform1f(this.loc(this.warp, 'uSeed'), this.seed);
      drawQuad(gl);
      this.pp.swap();
    }

    // draw shapes into the current frame
    if (frame.active) {
      const { lines, points } = this.buildShapes(frame, aspect);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pp.read.fbo);
      gl.useProgram(this.shape);
      gl.uniform2f(this.loc(this.shape, 'uAspect'), aspect[0], aspect[1]);
      gl.uniform1f(this.loc(this.shape, 'uPointSize'), Math.max(2, this.fbW / 200));
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts, 0, (lines * 2 + points) * 3);
      if (lines) gl.drawArrays(gl.LINES, 0, lines * 2);
      if (points) gl.drawArrays(gl.POINTS, lines * 2, points);
      gl.bindVertexArray(null);
    }

    // palette lookup to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
    gl.useProgram(this.out);
    bindTex(gl, 0, this.pp.read.tex, this.loc(this.out, 'uAcc'));
    bindTex(gl, 1, this.palTex, this.loc(this.out, 'uPalette'));
    gl.uniform1f(this.loc(this.out, 'uShift'), this.shift);
    drawQuad(gl);
  }
}

export const geissMode: VisualizerMode = {
  id: 'geiss',
  name: 'Geiss',
  family: 'winamp',
  renderer: 'webgl2',
  description: 'Palette-warped feedback in the style of the 1998 Geiss plugin: motion-vector fields, chasers, solar rays, morphing palettes',
  create: () => new GeissVis(),
};
