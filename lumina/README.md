# Lumina

A music player with a proper visualizer: fourteen visualization modes in the
spirit of Winamp (MilkDrop, AVS, the classic main-window analyser, Geiss) and
Windows Media Player of the Windows 2000 / XP era (Bars and Waves, Ambience,
Battery, Alchemy, Musical Colors, Plenoptic, Spikes, Particle), plus an XY
phosphor oscilloscope and a shader lab. Runs in the browser as an installable
PWA, plays your local files, reads their tags, and needs no server.

Built by assembling the best open-source work on GitHub — see
[NOTICE.md](NOTICE.md) for exactly what was taken from whom and under which
licence, and [docs/RESEARCH.md](docs/RESEARCH.md) for the research behind it.

## Run it

```bash
cd lumina
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (deploy anywhere, or open via `npm run preview`)
```

Requirements: Node 20+, a browser with WebGL2 (Chrome, Edge, Firefox, Safari 15+).
Chromium browsers additionally get the folder picker (File System Access API)
and PWA file handling (open .mp3/.flac/… with the installed app).

Drop music files or whole folders onto the window, use *Open files* /
*Open folder*, or hit *Play demo* to hear a synthesised demo track.

## Visualizer modes

| # | Mode | Lineage | Presets |
| --- | --- | --- | --- |
| 1 | **MilkDrop** | Winamp MilkDrop 2 via Butterchurn (WebGL2) | 395 presets, auto-cycling every 15 s with 2.7 s blends |
| 2 | **Winamp Classic** | The 76×16 main-window spectrum analyser / oscilloscope, Nullsoft FFT, viscolor palettes | 7 styles × 5 palettes |
| 3 | **Geiss** | Palette + motion-vector pixel warp of the 1998 plugin | 12 (with Auto) |
| 4 | **AVS** | Advanced Visualization Studio effect lists: SuperScope, Movement, Blur, Timescope, Bass Spin… | 12 |
| 5 | **WMP · Bars and Waves** | Bars, Ocean Mist, Fire Storm, Scope, Dot Scope | 6 |
| 6 | **WMP · Ambience** | Video-feedback swirls with the WMP colour cycle | 14 (all original preset names) |
| 7 | **WMP · Battery** | The XP default: Randomization, brightsphere, kaleidovision, event horizon… | 20 |
| 8 | **WMP · Alchemy** | Alchemy + the 3D Alchemy pack names | 6 |
| 9 | **WMP · Musical Colors** | WMP 7/8 Musical Colors | 21 (all original preset names) |
| 0 | **WMP · Plenoptic** | Smokey Circles, Smokey Lines, Vox, Flame, Fountain, Spyro | 7 |
| | **WMP · Spikes** | Spike / Amoeba in WMP 9 yellow or WMP 7 red/green | 4 |
| | **WMP · Particle** | The red/purple/blue/cyan dot plane | 2 |
| | **XY Oscilloscope** | woscope-style phosphor beam (left = X, right = Y), sweep and polar | 6 |
| | **Shader Lab** | Full-screen GLSL: spectrograph radial, synthwave grid, plasma cloud, pulse, neon tunnel, ribbons | 6 |

All modes share one analysis pipeline (`src/audio/analysis.ts`): byte and
float spectrum, stereo waveforms, MilkDrop-style `bass/mid/treb` with
attenuated averages, RMS level, an energy-variance beat detector and
log-spaced bars with peak hold.

## Keyboard

| Key | Action |
| --- | --- |
| Space · Z X C V B | Play/pause · Winamp prev/play/pause/stop/next |
| ← → (Shift) · ↑ ↓ | Seek 5 s (30 s) · volume |
| N / P | Next / previous track |
| M / Shift+M · 1…9 0 | Next / previous visualizer · pick by number |
| [ ] · R · L · Backspace | Prev/next preset · random · lock cycling · MilkDrop history |
| T · K | MilkDrop song title · Winamp palette |
| F / double-click | Fullscreen (controls auto-hide) |
| S · E · O / Shift+O · D · Tab · H | Shuffle · repeat · open files/folder · demo · playlist · help |

## Architecture

```
src/
  audio/engine.ts        Web Audio graph: <audio> → gain → destination, analysers (mono, L, R)
  audio/analysis.ts      shared AudioFrame: spectrum, waveforms, bands, beat, bars
  library/               local files & folders, drag-and-drop, tags (music-metadata), playlist, demo synth
  vis/host.ts            canvas per mode, render loop, fullscreen, hotkeys, toasts
  vis/modes/*.ts         one file per visualizer mode
  vis/wmp/feedback.ts    WebGL2 feedback engine shared by the WMP "Ambience family"
  vis/gl/glutil.ts       WebGL2 helpers (programs, ping-pong targets, data textures)
  ui/app.ts              the player shell
```

Adding a mode: implement `VisualizerMode` from `src/vis/types.ts` (a fresh
canvas is handed to `init`, `render(frame)` runs every animation frame) and
add it to `src/vis/registry.ts`.

## Development

```bash
npm run typecheck   # tsc
npm test            # vitest unit tests (analysis, playlist, loader, WAV encoder)
npm run build && npm run e2e   # Playwright smoke test: plays the demo, cycles every mode/preset, screenshots to e2e-out/
```

The end-to-end test uses the Chromium that Playwright finds (`CHROMIUM_PATH`
overrides it) with SwiftShader WebGL, so it runs on headless CI machines.

## Licence

MIT — see [LICENSE](LICENSE). Third-party components are listed in
[NOTICE.md](NOTICE.md); MilkDrop presets remain the work of their named
authors.
