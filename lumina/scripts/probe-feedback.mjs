// Diagnostic: measure visibility of every ink drawer / shift of the WMP feedback engine.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DIST = join(ROOT, 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = join(DIST, p); if (!existsSync(f) || statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[extname(f)] ?? 'application/octet-stream'); res.end(readFileSync(f)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url);
await page.click('[data-act=demo]');
await page.waitForFunction(() => window.lumina?.engine?.playing === true, null, { timeout: 60000 });
await page.evaluate(() => window.lumina.playlist.setRepeat('all'));
await page.evaluate(() => window.lumina.host.setModeById('wmp-battery'));
await page.waitForTimeout(1500);
const stats = async () => {
  const buf = await page.locator('[data-el=vis]').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = 120; c.height = 75; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 120, 75);
    const d = g.getImageData(0, 0, 120, 75).data; let lit = 0, sum = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; sum += v; if (v > 60) lit++; }
    return { lit: (lit / 9000).toFixed(3), mean: (sum / 9000 / 3).toFixed(1) };
  }, buf.toString('base64'));
};
const which = process.argv[2] || 'draw';
const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
for (let i = 0; i < 20; i++) {
  if (only && !only.includes(i)) continue;
  await page.evaluate(({ i, which }) => {
    const inst = window.lumina.host.current; const base = { ...inst.presets[1] };
    inst.presets[1] = which === 'draw' ? { ...base, draw: i, shift: 3, decay: 0.965, paletteLocked: true, palette: ['#000000', '#3060c0', '#e0c060', '#ffffff'], ink: 1, shiftStrength: 1 }
                                       : { ...base, draw: 11, shift: i, decay: 0.965, paletteLocked: true, palette: ['#000000', '#3060c0', '#e0c060', '#ffffff'], ink: 1, shiftStrength: 1 };
    inst.setPreset(1);
  }, { i, which });
  await page.waitForTimeout(1800);
  console.log(`${which} ${i}:`, JSON.stringify(await stats()));
  if (only) await page.locator('[data-el=vis]').screenshot({ path: join(ROOT, 'e2e-out', `probe-${which}-${i}.png`) });
}
await browser.close(); server.close();
