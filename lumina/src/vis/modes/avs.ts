/**
 * "AVS" — in the spirit of Winamp's Advanced Visualization Studio: an effect
 * list of Trans/Movement (per-pixel warp of the previous frame), Blur and
 * Fadeout, and Render effects (SuperScope-style parametric scopes,
 * Render/Simple analyser + scope, Timescope, Bass Spin, Dot Grid, Starfield,
 * Moving Particle) with AVS' 64-frames-per-colour cycling and on-beat
 * reactions. Original implementation; effect semantics follow the BSD-licensed
 * Nullsoft AVS sources (vis_avs) and its documentation.
 */
import type { AudioFrame } from '../../audio/analysis';
import { PingPong, QUAD_VS, bindTex, createProgram, drawQuad, getGL } from '../gl/glutil';
import type { VisContext, VisInstance, VisualizerMode } from '../types';

const MOVE_FS = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform int uMode;
uniform float uBlur;
uniform float uFade;
uniform vec2 uAspect;
uniform vec2 uTexel;
uniform float uTime;
uniform float uBass;
uniform float uDir;
in vec2 vUv;
out vec4 frag;
vec2 warp(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float scale = 1.0; float turn = 0.0;
  if (uMode == 1) { scale = 0.97; }                                              // zoom in
  else if (uMode == 2) { scale = 1.03; }                                         // zoom out
  else if (uMode == 3) { scale = 0.985; turn = 0.03 * uDir; }                    // roto blitter
  else if (uMode == 4) { turn = 0.09 * (0.9 - r) * uDir; scale = 0.99; }         // swirl
  else if (uMode == 5) { r += 0.012 * sin(r * 22.0 - uTime * 6.0); return vec2(cos(a), sin(a)) * r; } // ripple
  else if (uMode == 6) { return vec2(-abs(p.x), p.y) * 0.995; }                  // mirror x
  else if (uMode == 7) { return vec2(-abs(p.x), -abs(p.y)) * 0.99; }             // mirror 4-way
  else if (uMode == 8) { return p + vec2(0.012, 0.0); }                          // scroll left (timescope)
  else if (uMode == 9) { scale = 1.02; turn = 0.05 * (1.0 - r) * uDir; }         // big swirl out
  else if (uMode == 10) { return p + 0.006 * vec2(sin(p.y * 9.0 + uTime * 2.0), cos(p.x * 8.0 - uTime * 1.7)); } // water
  else if (uMode == 11) { scale = 0.94 + 0.08 * sin(uTime * 1.3) + uBass * 0.03; turn = 0.02 * uDir; } // blitter zoom
  else if (uMode == 12) { scale = 1.0 - 0.06 * uBass; turn = 0.0; }              // bass zoom
  float c = cos(turn), s = sin(turn);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c) * scale;
}
void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uAspect;
  vec2 q = warp(p);
  vec2 uv = (q / uAspect) * 0.5 + 0.5;
  vec3 col;
  if (uBlur > 0.5) {
    col = texture(uPrev, uv).rgb * 0.4;
    col += texture(uPrev, uv + vec2(uTexel.x, 0.0)).rgb * 0.15;
    col += texture(uPrev, uv - vec2(uTexel.x, 0.0)).rgb * 0.15;
    col += texture(uPrev, uv + vec2(0.0, uTexel.y)).rgb * 0.15;
    col += texture(uPrev, uv - vec2(0.0, uTexel.y)).rgb * 0.15;
  } else col = texture(uPrev, uv).rgb;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  col = max(col - uFade, 0.0);
  frag = vec4(col, 1.0);
}`;

const SHAPE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec3 aCol;
uniform vec2 uAspect;
uniform float uPointSize;
out vec3 vCol;
void main() { vCol = aCol; gl_Position = vec4(aPos / uAspect, 0.0, 1.0); gl_PointSize = uPointSize; }`;
const SHAPE_FS = `#version 300 es
precision highp float;
in vec3 vCol;
out vec4 frag;
void main() { frag = vec4(vCol, 1.0); }`;
const COPY_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 frag;
void main() { frag = vec4(texture(uTex, vUv).rgb, 1.0); }`;

type Rgb = [number, number, number];
type Draw = 'lines' | 'strip' | 'points';

interface Preset {
  name: string;
  move: number;
  blur: boolean;
  fade: number;
  colors: Rgb[];
  render: string[];
  beatFlip?: boolean;
}

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

const PRESETS: Preset[] = [
  { name: 'Simple · analyzer + scope', move: 0, blur: false, fade: 0.06, colors: [hex('#40ff40'), hex('#ffff40'), hex('#ff4040'), hex('#4040ff')], render: ['simple-analyzer', 'simple-scope'] },
  { name: 'SuperScope · spiral tunnel', move: 1, blur: true, fade: 0.01, colors: [hex('#ff8000'), hex('#ff0080'), hex('#00c0ff')], render: ['spiral'], beatFlip: true },
  { name: 'SuperScope · circle wave', move: 4, blur: false, fade: 0.02, colors: [hex('#00ffc0'), hex('#c0ff00'), hex('#ff00c0')], render: ['circle'], beatFlip: true },
  { name: 'Bass Spin + zoom', move: 2, blur: true, fade: 0.015, colors: [hex('#ff3030'), hex('#30ff30'), hex('#3030ff'), hex('#ffffff')], render: ['bassspin'] },
  { name: 'Dot Grid · water', move: 10, blur: false, fade: 0.03, colors: [hex('#80c0ff'), hex('#ffffff'), hex('#8080ff')], render: ['dotgrid', 'simple-scope'] },
  { name: '3D scope tunnel', move: 1, blur: true, fade: 0.0, colors: [hex('#ffffff'), hex('#ff80ff'), hex('#80ffff')], render: ['scope3d'] },
  { name: 'Rotating stars · mirror', move: 7, blur: false, fade: 0.025, colors: [hex('#ffd040'), hex('#ff4080'), hex('#40d0ff')], render: ['stars'] },
  { name: 'Timescope', move: 8, blur: false, fade: 0.0, colors: [hex('#ffffff')], render: ['timescope'] },
  { name: 'Ring · roto blitter', move: 3, blur: true, fade: 0.01, colors: [hex('#ff8000'), hex('#ffff00'), hex('#00ff80')], render: ['ring'], beatFlip: true },
  { name: 'Moving particle · swirl', move: 9, blur: true, fade: 0.012, colors: [hex('#ffffff'), hex('#80ff80'), hex('#ff8080')], render: ['particle', 'ring'] },
  { name: 'Starfield · blitter', move: 11, blur: false, fade: 0.02, colors: [hex('#ffffff'), hex('#c0c0ff')], render: ['starfield'], beatFlip: true },
  { name: 'Oscilloscope star · bass zoom', move: 12, blur: true, fade: 0.02, colors: [hex('#ff40ff'), hex('#40ffff'), hex('#ffff40')], render: ['oscstar'] },
];

interface Star {
  x: number;
  y: number;
  z: number;
}

export class AvsVis implements VisInstance {
  private gl: WebGL2RenderingContext | null = null;
  private move!: WebGLProgram;
  private shape!: WebGLProgram;
  private copy!: WebGLProgram;
  private pp: PingPong | null = null;
  private vbo!: WebGLBuffer;
  private vao!: WebGLVertexArrayObject;
  private verts = new Float32Array(5 * 8192);
  private preset = 0;
  private fbW = 0;
  private fbH = 0;
  private colorPos = 0;
  private dir = 1;
  private time = 0;
  private particle = { x: 0, y: 0, vx: 0.6, vy: 0.45 };
  private stars: Star[] = [];
  private spinAngle = 0;
  private u = new Map<string, WebGLUniformLocation | null>();

  init(ctx: VisContext): void {
    const gl = getGL(ctx.canvas);
    this.gl = gl;
    this.move = createProgram(gl, QUAD_VS, MOVE_FS);
    this.shape = createProgram(gl, SHAPE_VS, SHAPE_FS);
    this.copy = createProgram(gl, QUAD_VS, COPY_FS);
    this.vbo = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
    gl.bindVertexArray(null);
    this.allocate(ctx);
    for (let i = 0; i < 160; i++) this.stars.push({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() });
    try {
      const saved = parseInt(localStorage.getItem('lumina.avs') ?? '0', 10);
      if (saved >= 0 && saved < PRESETS.length) this.preset = saved;
    } catch {
      /* ignore */
    }
  }
  private allocate(ctx: VisContext): void {
    // AVS ran in a small window; keep the buffer ≤ 800 px so 1-px lines stay visible
    const s = Math.min(1, 800 / Math.max(ctx.canvas.width, ctx.canvas.height));
    this.fbW = Math.max(64, Math.round(ctx.canvas.width * s));
    this.fbH = Math.max(64, Math.round(ctx.canvas.height * s));
    if (!this.pp) this.pp = new PingPong(this.gl!, this.fbW, this.fbH, false);
    else this.pp.resize(this.fbW, this.fbH);
  }
  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    const k = (p === this.move ? 'm:' : p === this.shape ? 's:' : 'c:') + name;
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
    gl.deleteProgram(this.move);
    gl.deleteProgram(this.shape);
    gl.deleteProgram(this.copy);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
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
    this.pp?.clear();
    try {
      localStorage.setItem('lumina.avs', String(this.preset));
    } catch {
      /* ignore */
    }
  }

  /** AVS colour cycling: 64 frames per colour, linear blend. */
  private currentColor(p: Preset): Rgb {
    const n = p.colors.length;
    if (n === 1) return p.colors[0]!;
    const i = Math.floor(this.colorPos) % n;
    const f = this.colorPos - Math.floor(this.colorPos);
    const a = p.colors[i]!;
    const b = p.colors[(i + 1) % n]!;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  private buildRender(frame: AudioFrame, p: Preset, aspect: [number, number]): { draws: { mode: Draw; start: number; count: number }[]; vertCount: number } {
    const v = this.verts;
    let n = 0;
    const draws: { mode: Draw; start: number; count: number }[] = [];
    const col = this.currentColor(p);
    const put = (x: number, y: number, c: Rgb = col, k = 1) => {
      if (n + 5 > v.length) return;
      v[n++] = x;
      v[n++] = y;
      v[n++] = c[0] * k;
      v[n++] = c[1] * k;
      v[n++] = c[2] * k;
    };
    const begin = () => n / 5;
    const end = (mode: Draw, start: number) => {
      const count = n / 5 - start;
      if (count > 0) draws.push({ mode, start, count });
    };
    const ax = aspect[0];
    const ay = aspect[1];
    const wave = frame.wave;
    const bars = frame.bars(64, { minHz: 40, maxHz: 14000 });
    const t = this.time;
    const bass = Math.min(2, frame.bands.bassAtt);
    const vol = 0.5 + frame.level;

    for (const r of p.render) {
      if (r === 'simple-analyzer') {
        const s = begin();
        for (let i = 0; i < 64; i++) {
          const x = -0.95 * ax + (i / 63) * 1.9 * ax;
          const h = bars.values[i]! * 0.9;
          put(x, -0.95 * ay, col, 0.5);
          put(x, -0.95 * ay + h * ay);
        }
        end('lines', s);
      } else if (r === 'simple-scope') {
        const s = begin();
        for (let i = 0; i < 288; i++) {
          const x = -0.95 * ax + (i / 287) * 1.9 * ax;
          put(x, wave[Math.floor((i / 288) * 1024)]! * 0.5 * ay + (p.render.length > 1 ? 0.3 : 0) * ay);
        }
        end('strip', s);
      } else if (r === 'spiral') {
        const s = begin();
        const N = 400;
        for (let i = 0; i < N; i++) {
          const f = i / N;
          const w = wave[Math.floor(f * 1024)]!;
          const rad = f * 0.95 * (0.7 + w * 0.6 * vol);
          const a = f * Math.PI * 8 * this.dir + t * 1.2;
          put(Math.cos(a) * rad * ax * 0.9, Math.sin(a) * rad * ay * 0.9, col, 0.5 + f * 0.5);
        }
        end('strip', s);
      } else if (r === 'circle') {
        const s = begin();
        const N = 360;
        for (let i = 0; i <= N; i++) {
          const f = (i % N) / N;
          const w = wave[Math.floor(f * 1024)]!;
          const rad = 0.5 + w * 0.35 * vol;
          const a = f * Math.PI * 2 + t * 0.4 * this.dir;
          put(Math.cos(a) * rad * 0.9, Math.sin(a) * rad * 0.9);
        }
        end('strip', s);
      } else if (r === 'bassspin') {
        this.spinAngle += frame.dt * (1 + bass * 4) * this.dir;
        for (let side = -1; side <= 1; side += 2) {
          const s = begin();
          const cx = side * 0.45 * ax;
          const rad = 0.2 + bars.values[2]! * 0.6;
          for (let k = 0; k <= 3; k++) {
            const a = this.spinAngle * side + (k % 3) * ((Math.PI * 2) / 3);
            put(cx + Math.cos(a) * rad * ax * 0.6, Math.sin(a) * rad * ay);
          }
          end('strip', s);
        }
      } else if (r === 'dotgrid') {
        const s = begin();
        const ox = (t * 0.2) % 0.16;
        const oy = (t * 0.13) % 0.16;
        for (let y = -1; y <= 1.0; y += 0.16) for (let x = -1; x <= 1.0; x += 0.16) put((x + ox) * ax, (y + oy) * ay, col, 0.7 + bass * 0.2);
        end('points', s);
      } else if (r === 'scope3d') {
        // three scope lines at increasing depth, like the classic 3D scope preset
        for (let d = 0; d < 3; d++) {
          const s = begin();
          const depth = 1 - d * 0.28;
          for (let i = 0; i < 128; i++) {
            const f = i / 127;
            const w = wave[Math.floor(f * 1024)]!;
            put((f * 2 - 1) * depth * ax, (w * 0.45 * vol + (d - 1) * 0.35) * depth * ay, col, depth);
          }
          end('strip', s);
        }
      } else if (r === 'stars') {
        for (let k = 0; k < 3; k++) {
          const s = begin();
          const cx = (k - 1) * 0.55 * ax;
          const rot = t * (0.8 + k * 0.3) * this.dir;
          const rad = 0.18 + bars.values[k * 8 + 2]! * 0.35;
          for (let i = 0; i <= 10; i++) {
            const a = rot + i * (Math.PI / 5);
            const rr = i % 2 === 0 ? rad : rad * 0.45;
            put(cx + Math.cos(a) * rr * ax * 0.7, Math.sin(a) * rr * ay);
          }
          end('strip', s);
        }
      } else if (r === 'timescope') {
        // one column of spectrum at the right edge; movement scrolls it left
        const s = begin();
        const x = 0.985 * ax;
        for (let i = 0; i < 128; i++) {
          const f = i / 127;
          const b = bars.values[Math.floor(f * 63)]!;
          const y0 = (f * 2 - 1) * ay;
          const y1 = ((i + 1) / 127 * 2 - 1) * ay;
          // heat colours: dark blue → purple → orange → white
          const c: Rgb = [Math.min(1, b * 1.8), Math.max(0, b * 2.2 - 0.9), Math.min(1, 0.6 - b * 0.4 + b * b * 1.2)];
          put(x, y0, c, 0.25 + b);
          put(x, y1, c, 0.25 + b);
        }
        end('lines', s);
      } else if (r === 'ring') {
        const s = begin();
        const N = 200;
        for (let i = 0; i <= N; i++) {
          const f = (i % N) / N;
          const b = bars.values[Math.floor(f * 63)]!;
          const rad = 0.35 + b * 0.3 + bass * 0.05;
          const a = f * Math.PI * 2;
          put(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        end('strip', s);
      } else if (r === 'particle') {
        const pt = this.particle;
        pt.x += pt.vx * frame.dt;
        pt.y += pt.vy * frame.dt;
        if (Math.abs(pt.x) > 0.85 * ax) pt.vx = -pt.vx;
        if (Math.abs(pt.y) > 0.85 * ay) pt.vy = -pt.vy;
        const s = begin();
        const rad = 0.03 + (frame.beat ? 0.08 : 0) + bass * 0.02;
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          put(pt.x + Math.cos(a) * rad, pt.y + Math.sin(a) * rad, col, 1);
        }
        end('strip', s);
      } else if (r === 'starfield') {
        const s = begin();
        const speed = 0.35 + bass * 0.4;
        for (const st of this.stars) {
          st.z -= frame.dt * speed;
          if (st.z <= 0.02) {
            st.x = Math.random() * 2 - 1;
            st.y = Math.random() * 2 - 1;
            st.z = 1;
          }
          const sx = (st.x / st.z) * 0.5 * ax;
          const sy = (st.y / st.z) * 0.5 * ay;
          if (Math.abs(sx) < ax && Math.abs(sy) < ay) put(sx, sy, col, 1 - st.z * 0.8);
        }
        end('points', s);
      } else if (r === 'oscstar') {
        // OscStar: five waveform arms from the centre
        for (let arm = 0; arm < 5; arm++) {
          const s = begin();
          const a = t * 0.3 * this.dir + (arm / 5) * Math.PI * 2;
          const dx = Math.cos(a);
          const dy = Math.sin(a);
          for (let i = 0; i < 100; i++) {
            const f = i / 99;
            const w = wave[Math.floor(f * 1024)]! * 0.25 * vol;
            const x = dx * f * 0.85 - dy * w;
            const y = dy * f * 0.85 + dx * w;
            put(x * ax * 0.8, y * ay);
          }
          end('strip', s);
        }
      }
    }
    return { draws, vertCount: n / 5 };
  }

  render(frame: AudioFrame, ctx: VisContext): void {
    const gl = this.gl;
    if (!gl || !this.pp) return;
    const p = PRESETS[this.preset]!;
    if (frame.active) {
      this.time += frame.dt;
      this.colorPos += (frame.dt * 60) / 64;
      if (frame.beat && p.beatFlip && Math.random() < 0.5) this.dir = -this.dir;
    }
    const aspect: [number, number] = this.fbW > this.fbH ? [this.fbW / this.fbH, 1] : [1, this.fbH / this.fbW];

    gl.disable(gl.BLEND);
    gl.viewport(0, 0, this.fbW, this.fbH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pp.write.fbo);
    gl.useProgram(this.move);
    bindTex(gl, 0, this.pp.read.tex, this.loc(this.move, 'uPrev'));
    gl.uniform1i(this.loc(this.move, 'uMode'), frame.active ? p.move : 0);
    gl.uniform1f(this.loc(this.move, 'uBlur'), p.blur ? 1 : 0);
    gl.uniform1f(this.loc(this.move, 'uFade'), frame.active ? p.fade : 0.03);
    gl.uniform2f(this.loc(this.move, 'uAspect'), aspect[0], aspect[1]);
    gl.uniform2f(this.loc(this.move, 'uTexel'), 1 / this.fbW, 1 / this.fbH);
    gl.uniform1f(this.loc(this.move, 'uTime'), this.time);
    gl.uniform1f(this.loc(this.move, 'uBass'), Math.min(1, frame.bands.bassAtt / 1.8));
    gl.uniform1f(this.loc(this.move, 'uDir'), this.dir);
    drawQuad(gl);
    this.pp.swap();

    if (frame.active) {
      const { draws, vertCount } = this.buildRender(frame, p, aspect);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pp.read.fbo);
      gl.useProgram(this.shape);
      gl.uniform2f(this.loc(this.shape, 'uAspect'), aspect[0], aspect[1]);
      gl.uniform1f(this.loc(this.shape, 'uPointSize'), Math.max(2, this.fbW / 320));
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts, 0, vertCount * 5);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (const d of draws) {
        const mode = d.mode === 'lines' ? gl.LINES : d.mode === 'strip' ? gl.LINE_STRIP : gl.POINTS;
        gl.drawArrays(mode, d.start, d.count);
      }
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
    gl.useProgram(this.copy);
    bindTex(gl, 0, this.pp.read.tex, this.loc(this.copy, 'uTex'));
    drawQuad(gl);
  }
}

export const avsMode: VisualizerMode = {
  id: 'avs',
  name: 'AVS',
  family: 'winamp',
  renderer: 'webgl2',
  description: 'Winamp AVS-style effect lists: SuperScopes, Bass Spin, Timescope, Starfield, Roto Blitter and friends with colour cycling',
  create: () => new AvsVis(),
};
