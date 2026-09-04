/**
 * Full-screen audio-reactive fragment shaders for the "Shader Lab" mode.
 * Uniform contract (as in Audio-Shader-Studio): u_time, u_resolution,
 * u_bassLevel, u_trebleLevel, u_spectralCentroid, u_beatDetected,
 * u_audioLevel, u_energyLevel, sampler2D u_frequencyTexture (256×1, R).
 *
 * "Spectrograph Radial", "Plasma Cloud", "Synthwave Grid" and "Pulse" are
 * from Audio-Shader-Studio (MIT, Copyright (c) 2025 Daniel Sandner),
 * converted to GLSL ES 3.00 where needed. The rest are original.
 */

const HEAD = `#version 300 es
precision highp float;
out vec4 outColor;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_bassLevel;
uniform float u_trebleLevel;
uniform float u_spectralCentroid;
uniform float u_beatDetected;
uniform float u_audioLevel;
uniform float u_energyLevel;
uniform sampler2D u_frequencyTexture;
uniform sampler2D u_waveTexture;
const float PI = 3.1415926535;
`;

export interface LabShader {
  name: string;
  credit: string;
  /** render at this fraction of the canvas size (raymarchers are heavy) */
  scale: number;
  fs: string;
}

export const LAB_SHADERS: LabShader[] = [
  {
    name: 'Spectrograph Radial',
    credit: 'Audio-Shader-Studio (MIT)',
    scale: 1,
    fs:
      HEAD +
      `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  float s_bass = u_bassLevel;
  float s_treble = u_trebleLevel;
  float s_beat = pow(1.0 - fract(u_time * 2.0), 4.0) * u_beatDetected;
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  float freq_index = (angle / (2.0 * PI)) + 0.5;
  float spectral_radius = texture(u_frequencyTexture, vec2(freq_index, 0.5)).r;
  float shape_boundary = 0.2 + spectral_radius * (0.3 + s_treble);
  shape_boundary += sin(radius * 10.0 + angle * 3.0 - u_time * 0.8) * 0.05 * s_bass;
  float dist_to_shape = abs(radius - shape_boundary);
  float line_width = 0.005 + spectral_radius * 0.02;
  float line = smoothstep(line_width, 0.0, dist_to_shape);
  float glow = smoothstep(line_width + 0.1, 0.0, dist_to_shape);
  vec3 color = vec3(0.0);
  vec3 line_color = 0.5 + 0.5 * cos(freq_index * 2.0 * PI * 2.0 + vec3(0.0, 0.8, 1.5));
  color += line * line_color * 2.0;
  color += glow * line_color * 0.5;
  float core_glow = (0.01 / (radius + 0.001)) * (s_bass + s_beat * 2.0);
  color += core_glow * vec3(0.8, 0.9, 1.0);
  float shockwave = smoothstep(0.01, 0.0, abs(radius - s_beat * 0.8)) * s_beat;
  color += shockwave * 2.0;
  outColor = vec4(color, 1.0);
}`,
  },
  {
    name: 'Synthwave Grid',
    credit: 'Audio-Shader-Studio (MIT)',
    scale: 0.5,
    fs:
      HEAD +
      `
float map(vec3 p) {
  float d = p.y + 1.0;
  if (p.z > 5.0) {
    float freq_index = fract(p.x * 0.1);
    float building_height = texture(u_frequencyTexture, vec2(freq_index, 0.5)).r * 5.0;
    vec2 box_p = vec2(abs(fract(p.x - 0.5) - 0.5) - 0.2, p.y + 1.0);
    float building_dist = max(box_p.x, box_p.y);
    if (p.y < building_height - 1.0) d = min(d, building_dist);
  }
  return d;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  vec3 ro = vec3(0.0, 0.0, u_time * 2.0);
  vec3 rd = normalize(vec3(uv, 1.0));
  float t = 0.0;
  vec3 p = ro;
  for (int i = 0; i < 80; i++) {
    p = ro + rd * t;
    float d = map(p);
    if (d < 0.001 || t > 50.0) break;
    t += d;
  }
  vec3 color = vec3(0.0);
  if (t < 50.0) {
    vec2 grid_uv = p.xz;
    float line_thickness = 0.02;
    vec2 grid_dist = abs(fract(grid_uv) - 0.5);
    float grid_glow = smoothstep(line_thickness, 0.0, min(grid_dist.x, grid_dist.y));
    vec3 grid_color = mix(vec3(0.1, 0.8, 0.9), vec3(1.0), u_beatDetected);
    color = grid_color * grid_glow;
  } else {
    float sun = 1.0 - smoothstep(0.0, 0.2, length(uv - vec2(0.0, 0.2)));
    color += vec3(1.0, 0.6, 0.4) * sun * (1.0 + u_beatDetected);
    color = mix(color, vec3(0.5, 0.1, 0.8), 1.0 - smoothstep(0.0, 0.4, uv.y)) * (0.5 + u_bassLevel * 1.5);
  }
  color = mix(color, vec3(0.0, 0.0, 0.02), 1.0 - exp(-0.05 * t));
  outColor = vec4(color, 1.0);
}`,
  },
  {
    name: 'Plasma Cloud',
    credit: 'Audio-Shader-Studio (MIT)',
    scale: 0.6,
    fs:
      HEAD +
      `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min( g.xyz, l.zxy ); vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy; vec4 y = y_ *ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy ); vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m; return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}
float fbm(vec3 p) {
  float value = 0.0; float amplitude = 0.5;
  for (int i = 0; i < 5; i++) { value += amplitude * snoise(p); p *= 2.0; amplitude *= 0.5; }
  return value;
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  float time = u_time * 0.2;
  vec2 bass_warp = vec2(sin(time), cos(time)) * u_bassLevel * 0.5;
  float treble_jitter = snoise(vec3(uv * 10.0, u_time * 20.0)) * u_trebleLevel * 0.1;
  vec2 final_uv = uv + bass_warp + treble_jitter;
  float r = fbm(vec3(final_uv * 1.5, time));
  float g = fbm(vec3(final_uv * 1.5 + 0.1, time));
  float b = fbm(vec3(final_uv * 1.5 + 0.2, time));
  float noise_value = (r + g + b) / 3.0;
  float beat_pulse = pow(1.0 - fract(u_time * 2.0), 4.0) * u_beatDetected;
  float core_gravity = 1.0 + beat_pulse * 10.0;
  float core_glow = 0.02 / pow(length(uv), 1.5 * core_gravity);
  float hue = 0.6 + u_spectralCentroid * 0.3;
  float saturation = 0.8 + noise_value * 0.2;
  float value = pow(noise_value, 2.0) * 1.5 + core_glow * 2.0;
  vec3 finalColor = hsv2rgb(vec3(hue, saturation, value));
  finalColor += vec3(r, g, b) * 0.3;
  finalColor += beat_pulse * 0.5;
  finalColor = pow(finalColor, vec3(1.5));
  finalColor = finalColor / (finalColor + vec3(1.0));
  outColor = vec4(finalColor, 1.0);
}`,
  },
  {
    name: 'Pulse (cellular growth)',
    credit: 'Audio-Shader-Studio (MIT)',
    scale: 1,
    fs:
      HEAD +
      `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  float growth_speed = u_time * 0.2 * (0.5 + u_energyLevel * 2.0);
  float lobes = floor(2.0 + u_bassLevel * 8.0);
  float jagged_detail = 0.05 * u_trebleLevel * sin(angle * 20.0 * (1.0 + u_spectralCentroid));
  float beat_ring = smoothstep(0.0, 0.1, u_beatDetected) * smoothstep(0.05, 0.0, abs(radius - (growth_speed * 0.1)));
  float shape_radius = 0.2 + fract(growth_speed * 0.5) * 0.5;
  shape_radius += cos(angle * lobes) * 0.1 * (0.5 + u_energyLevel);
  shape_radius += jagged_detail;
  float dist_to_shape = abs(radius - shape_radius);
  float thickness = 0.01 + u_energyLevel * 0.05;
  float line = smoothstep(thickness, 0.0, dist_to_shape);
  vec3 color = vec3(0.0);
  vec3 line_color = mix(vec3(1.0, 0.3, 0.8), vec3(0.3, 1.0, 0.8), u_spectralCentroid);
  color += line * line_color;
  color += beat_ring * vec3(1.0, 0.9, 0.5);
  float core_glow = 1.0 / (radius * 100.0 + 1.0) * u_bassLevel * 2.0;
  color += core_glow * vec3(0.2, 0.5, 1.0);
  outColor = vec4(color, 1.0);
}`,
  },
  {
    name: 'Neon Spectrum Tunnel',
    credit: 'Lumina',
    scale: 1,
    fs:
      HEAD +
      `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  float depth = 0.25 / (r + 0.05) + u_time * 1.5 + u_bassLevel * 0.5;
  float ring = smoothstep(0.35, 0.0, abs(fract(depth) - 0.5)) ;
  float fi = fract(a / (2.0 * PI) + 0.5 + u_time * 0.02);
  float f = texture(u_frequencyTexture, vec2(abs(fi * 2.0 - 1.0), 0.5)).r;
  float segs = smoothstep(0.2, 0.8, abs(sin(a * 12.0 + depth * 0.5)));
  vec3 col = 0.5 + 0.5 * cos(depth * 0.6 + vec3(0.0, 2.0, 4.0) + u_spectralCentroid * 3.0);
  float glow = ring * (0.3 + f * 1.4) * segs;
  glow += smoothstep(0.02, 0.0, abs(r - 0.1 - u_bassLevel * 0.08)) * (1.0 + u_beatDetected * 2.0);
  col *= glow;
  col *= 1.0 - smoothstep(0.6, 1.1, r);
  col += vec3(0.02, 0.0, 0.05);
  outColor = vec4(col, 1.0);
}`,
  },
  {
    name: 'Waveform Ribbons',
    credit: 'Lumina',
    scale: 1,
    fs:
      HEAD +
      `
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  vec3 col = vec3(0.01, 0.01, 0.03);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float x = fract(uv.x + fi * 0.13 + u_time * 0.02 * (fi + 1.0));
    float w = texture(u_waveTexture, vec2(x, 0.5)).r * 2.0 - 1.0;
    float y = w * (0.12 + u_audioLevel * 0.3) + (fi - 2.5) * 0.11 + 0.04 * sin(u_time * 0.7 + fi);
    float d = abs(p.y - y);
    vec3 c = 0.5 + 0.5 * cos(fi * 1.1 + u_time * 0.3 + vec3(0.0, 2.1, 4.2));
    col += c * (0.004 / (d + 0.004)) * (0.5 + u_energyLevel);
  }
  col += vec3(0.3, 0.1, 0.5) * u_beatDetected * 0.15;
  outColor = vec4(1.0 - exp(-col), 1.0);
}`,
  },
];
