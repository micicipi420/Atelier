/**
 * XY Oscilloscope — an analogue vector-scope: left channel drives X, right
 * channel drives Y, drawn as a phosphor beam with afterglow. The beam
 * rendering (segment quads shaded with the analytic Gaussian-beam integral)
 * follows woscope (MIT, Igor Null & Chad von Nau), re-written for WebGL2.
 */
import type { AudioFrame } from '../../audio/analysis';
import { PingPong, QUAD_VS, bindTex, createProgram, drawQuad, getGL } from '../gl/glutil';
import type { VisContext, VisInstance, VisualizerMode } from '../types';

const N = 2048;

const LINE_VS = `#version 300 es
precision highp float;
#define EPS 1e-6
uniform float uSize;
uniform vec2 uAspect;
uniform float uCount;
layout(location=0) in vec2 aStart;
layout(location=1) in vec2 aEnd;
out vec4 uvl;
void main() {
  int idx = gl_VertexID;            // 0..3 of the strip
  vec2 current; float tang;
  if (idx >= 2) { current = aEnd; tang = 1.0; } else { current = aStart; tang = -1.0; }
  float side = (float(idx & 1) - 0.5) * 2.0;
  uvl.xy = vec2(tang, side);
  uvl.w = float(gl_InstanceID) / uCount;
  vec2 dir = aEnd - aStart;
  uvl.z = length(dir);
  if (uvl.z > EPS) dir /= uvl.z; else dir = vec2(1.0, 0.0);
  vec2 norm = vec2(-dir.y, dir.x);
  vec2 p = current + (tang * dir + norm * side) * uSize;
  gl_Position = vec4(p * uAspect, 0.0, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
#define EPS 1e-6
#define SQRT2 1.4142135623730951
uniform float uSize;
uniform float uIntensity;
uniform vec4 uColor;
in vec4 uvl;
out vec4 frag;
float erf(float x) {
  float s = sign(x), a = abs(x);
  x = 1.0 + (0.278393 + (0.230389 + (0.000972 + 0.078108 * a) * a) * a) * a;
  x *= x;
  return s - s / (x * x);
}
void main() {
  float len = uvl.z;
  vec2 xy = vec2((len / 2.0 + uSize) * uvl.x + len / 2.0, uSize * uvl.y);
  float sigma = uSize / 4.0;
  float alpha;
  if (len < EPS) {
    alpha = exp(-pow(length(xy), 2.0) / (2.0 * sigma * sigma)) / 2.0 / sqrt(uSize);
  } else {
    // analytic integral of the Gaussian beam moving along the segment:
    // long fast segments are dim, slow/short ones bright — like a real CRT
    alpha = erf((len - xy.x) / SQRT2 / sigma) + erf(xy.x / SQRT2 / sigma);
    alpha *= exp(-xy.y * xy.y / (2.0 * sigma * sigma)) / 2.0 / len * uSize;
  }
  float afterglow = smoothstep(0.0, 0.33, uvl.w);
  alpha *= afterglow * uIntensity;
  frag = vec4(uColor.rgb * alpha, alpha);
}`;

const DECAY_FS = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform float uDecay;
in vec2 vUv;
out vec4 frag;
void main() { frag = texture(uPrev, vUv) * uDecay; }`;

const OUT_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec4 uColor;
uniform float uGrid;
uniform vec2 uAspect;
in vec2 vUv;
out vec4 frag;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  vec3 b = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853981;
    b += texture(uTex, vUv + vec2(cos(a), sin(a)) * uTexel * 3.0).rgb;
  }
  c += b * 0.06;
  vec2 p = (vUv * 2.0 - 1.0) / uAspect;
  float g = 0.0;
  if (uGrid > 0.5) {
    vec2 gp = abs(fract(p * 2.5 + 0.5) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.02, min(gp.x, gp.y));
    float axis = 1.0 - smoothstep(0.0, 0.01, min(abs(p.x), abs(p.y)));
    g = line * 0.12 + axis * 0.18;
  }
  vec3 col = vec3(1.0) - exp(-c * 1.6);
  col += uColor.rgb * g * 0.5;
  float v = 1.0 - 0.35 * dot(p * 0.6, p * 0.6);
  frag = vec4(col * v + vec3(0.02, 0.025, 0.02) * v, 1.0);
}`;

interface Preset {
  name: string;
  color: [number, number, number];
  mode: 'xy' | 'sweep' | 'polar';
  grid: boolean;
  decay: number;
  size: number;
}

const PRESETS: Preset[] = [
  { name: 'XY · green phosphor', color: [0.25, 1.0, 0.25], mode: 'xy', grid: false, decay: 0.78, size: 0.014 },
  { name: 'XY · graticule', color: [0.35, 1.0, 0.45], mode: 'xy', grid: true, decay: 0.7, size: 0.012 },
  { name: 'XY · blue', color: [0.35, 0.65, 1.0], mode: 'xy', grid: false, decay: 0.84, size: 0.016 },
  { name: 'XY · amber', color: [1.0, 0.72, 0.2], mode: 'xy', grid: false, decay: 0.8, size: 0.014 },
  { name: 'Sweep · time domain', color: [0.25, 1.0, 0.25], mode: 'sweep', grid: true, decay: 0.55, size: 0.012 },
  { name: 'Polar', color: [0.9, 0.4, 1.0], mode: 'polar', grid: false, decay: 0.85, size: 0.013 },
];

export class XYScopeVis implements VisInstance {
  private gl: WebGL2RenderingContext | null = null;
  private line!: WebGLProgram;
  private decay!: WebGLProgram;
  private out!: WebGLProgram;
  private vbo!: WebGLBuffer;
  private vao!: WebGLVertexArrayObject;
  private pp: PingPong | null = null;
  private points = new Float32Array(N * 2);
  private preset = 0;
  private u = new Map<string, WebGLUniformLocation | null>();

  init(ctx: VisContext): void {
    const gl = getGL(ctx.canvas);
    this.gl = gl;
    this.line = createProgram(gl, LINE_VS, LINE_FS);
    this.decay = createProgram(gl, QUAD_VS, DECAY_FS);
    this.out = createProgram(gl, QUAD_VS, OUT_FS);
    this.vbo = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.points, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 8, 8);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    const float = !!gl.getExtension('EXT_color_buffer_float');
    this.pp = new PingPong(gl, ctx.canvas.width, ctx.canvas.height, float);
    try {
      const saved = parseInt(localStorage.getItem('lumina.xyscope') ?? '0', 10);
      if (saved >= 0 && saved < PRESETS.length) this.preset = saved;
    } catch {
      /* ignore */
    }
  }
  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    const cacheKey = (p === this.line ? 'l:' : p === this.decay ? 'd:' : 'o:') + name;
    if (!this.u.has(cacheKey)) this.u.set(cacheKey, this.gl!.getUniformLocation(p, name));
    return this.u.get(cacheKey) ?? null;
  }

  resize(ctx: VisContext): void {
    this.pp?.resize(ctx.canvas.width, ctx.canvas.height);
  }
  destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    this.pp?.dispose();
    gl.deleteProgram(this.line);
    gl.deleteProgram(this.decay);
    gl.deleteProgram(this.out);
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
    try {
      localStorage.setItem('lumina.xyscope', String(this.preset));
    } catch {
      /* ignore */
    }
  }

  private fillPoints(frame: AudioFrame, p: Preset): void {
    const L = frame.waveL;
    const R = frame.waveR;
    const pts = this.points;
    const gain = 0.85;
    if (p.mode === 'xy') {
      for (let i = 0; i < N; i++) {
        pts[i * 2] = L[i]! * gain;
        pts[i * 2 + 1] = R[i]! * gain;
      }
    } else if (p.mode === 'sweep') {
      let start = 0;
      for (let i = 1; i < N / 2; i++) {
        if (L[i - 1]! <= 0 && L[i]! > 0) {
          start = i;
          break;
        }
      }
      const span = N / 2;
      for (let i = 0; i < N; i++) {
        const j = start + Math.floor((i * span) / N);
        pts[i * 2] = (i / (N - 1)) * 1.8 - 0.9;
        pts[i * 2 + 1] = (L[j] ?? 0) * gain;
      }
    } else {
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 4 + frame.time * 0.3;
        const r = 0.45 + (L[i]! * 0.5 + R[i]! * 0.5) * 0.5 * gain;
        pts[i * 2] = Math.cos(a) * r;
        pts[i * 2 + 1] = Math.sin(a) * r;
      }
    }
  }

  render(frame: AudioFrame, ctx: VisContext): void {
    const gl = this.gl;
    if (!gl || !this.pp) return;
    const p = PRESETS[this.preset]!;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const aspect: [number, number] = w > h ? [h / w, 1] : [1, w / h];
    this.fillPoints(frame, p);

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pp.write.fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.decay);
    bindTex(gl, 0, this.pp.read.tex, this.loc(this.decay, 'uPrev'));
    gl.uniform1f(this.loc(this.decay, 'uDecay'), frame.active ? p.decay : 0.9);
    drawQuad(gl);

    if (frame.active || frame.rms > 0.001) {
      gl.useProgram(this.line);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.points);
      gl.uniform1f(this.loc(this.line, 'uSize'), p.size);
      gl.uniform2f(this.loc(this.line, 'uAspect'), aspect[0], aspect[1]);
      gl.uniform1f(this.loc(this.line, 'uCount'), N - 1);
      gl.uniform1f(this.loc(this.line, 'uIntensity'), 1.0);
      gl.uniform4f(this.loc(this.line, 'uColor'), p.color[0], p.color[1], p.color[2], 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N - 1);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }
    this.pp.swap();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.out);
    bindTex(gl, 0, this.pp.read.tex, this.loc(this.out, 'uTex'));
    gl.uniform2f(this.loc(this.out, 'uTexel'), 1 / w, 1 / h);
    gl.uniform4f(this.loc(this.out, 'uColor'), p.color[0], p.color[1], p.color[2], 1);
    gl.uniform1f(this.loc(this.out, 'uGrid'), p.grid ? 1 : 0);
    gl.uniform2f(this.loc(this.out, 'uAspect'), aspect[0], aspect[1]);
    drawQuad(gl);
  }
}

export const xyScopeMode: VisualizerMode = {
  id: 'xy-scope',
  name: 'XY Oscilloscope',
  family: 'scope',
  renderer: 'webgl2',
  description: 'Vector-scope phosphor beam: left channel = X, right channel = Y (Lissajous figures), with sweep and polar variants',
  create: () => new XYScopeVis(),
};
