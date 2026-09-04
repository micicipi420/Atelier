/**
 * "Shader Lab" — modern full-screen GLSL visualisers driven by the
 * Audio-Shader-Studio uniform contract (bass/treble/centroid/beat + a
 * 256-px spectrum texture and a 512-px waveform texture).
 */
import type { AudioFrame } from '../../audio/analysis';
import { DataTexture, PingPong, QUAD_VS, bindTex, createProgram, drawQuad, getGL } from '../gl/glutil';
import { LAB_SHADERS } from '../shaders/lab';
import type { VisContext, VisInstance, VisualizerMode } from '../types';

const COPY_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 frag;
void main() { frag = vec4(texture(uTex, vUv).rgb, 1.0); }`;

export class ShaderLabVis implements VisInstance {
  private gl: WebGL2RenderingContext | null = null;
  private programs: (WebGLProgram | null)[] = [];
  private copy!: WebGLProgram;
  private target: PingPong | null = null;
  private freqTex!: DataTexture;
  private waveTex!: DataTexture;
  private freqBuf = new Float32Array(256);
  private waveBuf = new Float32Array(512);
  private preset = 0;
  private time = 0;
  private env = { bass: 0, treble: 0, centroid: 0.3, level: 0 };
  private uniforms = new Map<string, WebGLUniformLocation | null>();

  init(ctx: VisContext): void {
    const gl = getGL(ctx.canvas);
    this.gl = gl;
    this.copy = createProgram(gl, QUAD_VS, COPY_FS);
    this.programs = LAB_SHADERS.map((s) => {
      try {
        return createProgram(gl, QUAD_VS, s.fs);
      } catch (err) {
        console.warn('shader failed to compile:', s.name, err);
        return null;
      }
    });
    this.freqTex = new DataTexture(gl, 256);
    this.waveTex = new DataTexture(gl, 512);
    this.target = new PingPong(gl, 64, 64, false);
    try {
      const saved = parseInt(localStorage.getItem('lumina.shaderlab') ?? '0', 10);
      if (saved >= 0 && saved < LAB_SHADERS.length) this.preset = saved;
    } catch {
      /* ignore */
    }
  }
  resize(): void {}
  destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    for (const p of this.programs) if (p) gl.deleteProgram(p);
    gl.deleteProgram(this.copy);
    this.freqTex.dispose();
    this.waveTex.dispose();
    this.target?.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
  presetCount(): number {
    return LAB_SHADERS.length;
  }
  presetName(i = this.preset): string {
    const s = LAB_SHADERS[i];
    return s ? `${s.name} — ${s.credit}` : '';
  }
  currentPreset(): number {
    return this.preset;
  }
  setPreset(i: number): void {
    this.preset = ((i % LAB_SHADERS.length) + LAB_SHADERS.length) % LAB_SHADERS.length;
    try {
      localStorage.setItem('lumina.shaderlab', String(this.preset));
    } catch {
      /* ignore */
    }
  }
  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    const k = `${this.preset}:${name}`;
    if (!this.uniforms.has(k)) this.uniforms.set(k, this.gl!.getUniformLocation(p, name));
    return this.uniforms.get(k) ?? null;
  }

  private updateAudio(frame: AudioFrame): void {
    const freq = frame.freq;
    const n = freq.length;
    let bass = 0;
    let bn = 0;
    let treb = 0;
    let tn = 0;
    let wsum = 0;
    let sum = 0;
    for (let i = 1; i < n; i++) {
      const hz = frame.binHz(i);
      const v = freq[i]! / 255;
      sum += v;
      wsum += v * i;
      if (hz < 200) {
        bass += v;
        bn++;
      } else if (hz > 2500 && hz < 14000) {
        treb += v;
        tn++;
      }
    }
    const e = this.env;
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    e.bass = lerp(e.bass, Math.min(1, (bn ? bass / bn : 0) * 1.6), 0.3);
    e.treble = lerp(e.treble, Math.min(1, (tn ? treb / tn : 0) * 2.2), 0.3);
    e.centroid = lerp(e.centroid, sum ? wsum / sum / n : 0, 0.1);
    e.level = lerp(e.level, frame.level, 0.3);
    // log-spaced 256-px spectrum texture so shaders see bass on the left, treble right
    const bars = frame.bars(256, { minHz: 30, maxHz: 16000, attack: 0.8, release: 0.4 });
    this.freqBuf.set(bars.values);
    this.freqTex.upload(this.freqBuf);
    const wave = frame.wave;
    for (let i = 0; i < 512; i++) this.waveBuf[i] = wave[Math.floor((i / 512) * wave.length)] ?? 0;
    this.waveTex.upload(this.waveBuf, true);
  }

  render(frame: AudioFrame, ctx: VisContext): void {
    const gl = this.gl;
    if (!gl || !this.target) return;
    const shader = LAB_SHADERS[this.preset]!;
    const prog = this.programs[this.preset];
    if (frame.active) this.time += frame.dt;
    this.updateAudio(frame);
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const w = Math.max(64, Math.round(W * shader.scale));
    const h = Math.max(64, Math.round(H * shader.scale));
    this.target.resize(w, h);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.write.fbo);
    gl.viewport(0, 0, w, h);
    if (!prog) {
      gl.clearColor(0.1, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
      gl.useProgram(prog);
      gl.uniform1f(this.loc(prog, 'u_time'), this.time);
      gl.uniform2f(this.loc(prog, 'u_resolution'), w, h);
      gl.uniform1f(this.loc(prog, 'u_bassLevel'), this.env.bass);
      gl.uniform1f(this.loc(prog, 'u_trebleLevel'), this.env.treble);
      gl.uniform1f(this.loc(prog, 'u_spectralCentroid'), this.env.centroid);
      gl.uniform1f(this.loc(prog, 'u_beatDetected'), frame.beatEnergy);
      gl.uniform1f(this.loc(prog, 'u_audioLevel'), frame.rms * 2);
      gl.uniform1f(this.loc(prog, 'u_energyLevel'), this.env.level);
      bindTex(gl, 0, this.freqTex.tex, this.loc(prog, 'u_frequencyTexture'));
      bindTex(gl, 1, this.waveTex.tex, this.loc(prog, 'u_waveTexture'));
      drawQuad(gl);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.copy);
    bindTex(gl, 0, this.target.write.tex, gl.getUniformLocation(this.copy, 'uTex'));
    drawQuad(gl);
  }
}

export const shaderLabMode: VisualizerMode = {
  id: 'shader-lab',
  name: 'Shader Lab',
  family: 'shader',
  renderer: 'webgl2',
  description: 'Modern full-screen GLSL visualisers: spectrograph radial, synthwave grid, plasma cloud, neon tunnel, waveform ribbons',
  create: () => new ShaderLabVis(),
};
