/** Small WebGL2 helpers shared by the shader-based modes. */

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile error: ${log}\n${src}`);
  }
  return sh;
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram failed');
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`program link error: ${log}`);
  }
  return p;
}

export const QUAD_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // fullscreen triangle
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Draw a fullscreen triangle (no buffers needed with gl_VertexID). */
export function drawQuad(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

export function createTarget(gl: WebGL2RenderingContext, w: number, h: number, linear = true, float = false): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const filt = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, fbo };
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target | null): void {
  if (!t) return;
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
}

/** Two render targets swapped every frame — the basis of every feedback effect. */
export class PingPong {
  private a: Target;
  private b: Target;
  width: number;
  height: number;
  constructor(
    private gl: WebGL2RenderingContext,
    w: number,
    h: number,
    private float = false,
  ) {
    this.width = w;
    this.height = h;
    this.a = createTarget(gl, w, h, true, float);
    this.b = createTarget(gl, w, h, true, float);
  }
  get read(): Target {
    return this.a;
  }
  get write(): Target {
    return this.b;
  }
  swap(): void {
    const t = this.a;
    this.a = this.b;
    this.b = t;
  }
  resize(w: number, h: number): void {
    if (w === this.width && h === this.height) return;
    this.dispose();
    this.width = w;
    this.height = h;
    this.a = createTarget(this.gl, w, h, true, this.float);
    this.b = createTarget(this.gl, w, h, true, this.float);
  }
  clear(): void {
    const gl = this.gl;
    for (const t of [this.a, this.b]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  dispose(): void {
    deleteTarget(this.gl, this.a);
    deleteTarget(this.gl, this.b);
  }
}

/** 1-D data texture (e.g. spectrum or waveform) uploaded every frame. */
export class DataTexture {
  readonly tex: WebGLTexture;
  private buf: Uint8Array;
  constructor(
    private gl: WebGL2RenderingContext,
    readonly length: number,
  ) {
    this.buf = new Uint8Array(length);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, this.buf);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  /** Upload floats in 0..1 (or -1..1 when `signed`). */
  upload(data: ArrayLike<number>, signed = false): void {
    const n = Math.min(this.length, data.length);
    for (let i = 0; i < n; i++) {
      const v = signed ? data[i]! * 0.5 + 0.5 : data[i]!;
      this.buf[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.length, 1, gl.RED, gl.UNSIGNED_BYTE, this.buf);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  uploadBytes(data: Uint8Array): void {
    const gl = this.gl;
    const n = Math.min(this.length, data.length);
    this.buf.set(data.subarray(0, n));
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.length, 1, gl.RED, gl.UNSIGNED_BYTE, this.buf);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  dispose(): void {
    this.gl.deleteTexture(this.tex);
  }
}

export function getGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 not available');
  return gl;
}

export function bindTex(gl: WebGL2RenderingContext, unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(loc, unit);
}
