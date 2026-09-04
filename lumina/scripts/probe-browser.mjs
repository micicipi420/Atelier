import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', m => console.log('[console]', m.text()));
await page.setContent(`<canvas id=c width=64 height=64></canvas>`);
const r = await page.evaluate(async () => {
  const c = document.getElementById('c');
  const gl = c.getContext('webgl2');
  const out = { webgl2: !!gl };
  if (gl) { const dbg = gl.getExtension('WEBGL_debug_renderer_info'); out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); out.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE); out.floatTex = !!gl.getExtension('EXT_color_buffer_float'); }
  const ac = new AudioContext();
  await ac.resume();
  out.audioState = ac.state; out.sampleRate = ac.sampleRate;
  const osc = ac.createOscillator(); const an = ac.createAnalyser(); osc.connect(an); an.connect(ac.destination); osc.start();
  await new Promise(r => setTimeout(r, 300));
  const buf = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(buf);
  out.maxBin = Math.max(...buf); out.currentTime = ac.currentTime;
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
