// End-to-end smoke test: serves dist/, loads demo audio, cycles every visualizer
// mode and preset, screenshots each, and checks that something was drawn.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'e2e-out');
mkdirSync(OUT, { recursive: true });
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ missing — run `npm run build` first');
  process.exit(1);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.wav': 'audio/wav' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = join(DIST, p);
  if (!existsSync(f) || statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
  res.setHeader('Content-Type', MIME[extname(f)] ?? 'application/octet-stream');
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForSelector('[data-el=vis]');

const report = { modes: [], errors, ok: true };
const fail = (msg) => { report.ok = false; console.error('FAIL:', msg); };

// 1. load demo (synthesised in the page)
await page.click('[data-act=demo]');
await page.waitForFunction(() => window.lumina?.engine?.playing === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const state = await page.evaluate(() => ({ n: window.lumina.playlist.length, title: window.lumina.engine.track?.title, t: window.lumina.engine.currentTime }));
console.log('playing:', state);
if (state.n !== 2 || state.t <= 0) fail('demo did not play');

// 2. analysis sanity
const frame = await page.evaluate(() => { const f = window.lumina.host.frame; return { rms: f.rms, bass: f.bands.bass, level: f.level, fps: f.fps, maxFreq: Math.max(...f.freq) }; });
console.log('frame:', frame);
if (!(frame.maxFreq > 20)) fail('analyser produced no spectrum');

// 3. every mode & preset
const modes = await page.evaluate(() => window.lumina.host.allModes.map((m) => ({ id: m.id, name: m.name })));
const nonBlack = async (label) => {
  const buf = await page.locator('[data-el=vis]').screenshot({ path: join(OUT, `${label}.png`) });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let lit = 0, sum = 0; for (let i = 0; i < d.length; i += 16) { const v = d[i] + d[i + 1] + d[i + 2]; sum += v; if (v > 60) lit++; }
    return { litFraction: lit / (d.length / 16), mean: sum / (d.length / 16) / 3 };
  }, buf.toString('base64'));
};
for (const m of modes) {
  await page.evaluate((id) => window.lumina.host.setModeById(id), m.id);
  await page.waitForTimeout(m.id === 'milkdrop' ? 6000 : 1500);
  const presets = await page.evaluate(() => window.lumina.host.current?.presetCount?.() ?? 0);
  const entry = { id: m.id, presets, shots: [] };
  const count = Math.min(presets, m.id === 'milkdrop' ? 3 : 8);
  for (let p = 0; p < Math.max(1, count); p++) {
    if (presets) await page.evaluate((i) => window.lumina.host.setPreset(i), p);
    await page.waitForTimeout(m.id === 'milkdrop' ? 2500 : 900);
    const name = presets ? await page.evaluate(() => window.lumina.host.current.presetName()) : '';
    const stats = await nonBlack(`${m.id}-${p}`);
    entry.shots.push({ preset: name, ...stats });
    if (stats.litFraction < 0.002) fail(`${m.id} preset "${name}" rendered (almost) black`);
  }
  report.modes.push(entry);
  console.log(`mode ${m.id}: ${presets} presets`, entry.shots.map((s) => `${s.preset}: lit=${s.litFraction.toFixed(3)}`).join(' | '));
}

// 4. full-page screenshot of the UI
await page.screenshot({ path: join(OUT, 'app.png') });

// 5. file input with real WAV fixtures + tag reading path
const fixtures = ['01 - Fixture - Beat Test.wav', '02 - Fixture - Sweep.wav'].map((f) => join(OUT, f)).filter(existsSync);
if (fixtures.length) {
  await page.setInputFiles('[data-el=file-input]', fixtures);
  await page.waitForTimeout(1500);
  const pl = await page.evaluate(() => window.lumina.playlist.tracks.map((t) => ({ title: t.title, artist: t.artist, tagged: t.tagged, dur: t.duration })));
  console.log('playlist after upload:', pl);
  if (pl.length !== 2 + fixtures.length) fail('fixtures not added');
  await page.evaluate(() => window.lumina.host.setMode(1));
  await page.keyboard.press('KeyN'); // next track hotkey
  await page.waitForTimeout(1200);
  const cur = await page.evaluate(() => ({ title: window.lumina.engine.track?.title, playing: window.lumina.engine.playing }));
  console.log('after N:', cur);
  if (!cur.playing) fail('next track did not play');
}

const fatal = errors.filter((e) => !/favicon|manifest/.test(e));
if (fatal.length) { console.log('console errors/warnings:', fatal); }
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.close();
console.log(report.ok ? 'E2E OK' : 'E2E FAILED');
process.exit(report.ok ? 0 : 1);
