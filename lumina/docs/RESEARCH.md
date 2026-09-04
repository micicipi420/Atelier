# Research: what Lumina takes from open source, and why

Lumina was built by first surveying GitHub for everything reusable in seven
areas, verifying licences and APIs against the actual repositories and npm
tarballs, and only then choosing what to depend on, vendor, port or merely
study. This document records the outcome. Licence status is what was read in
the projects' own LICENSE files or package manifests on 2026-09-04.

Rule applied throughout: Lumina is MIT, so MIT / BSD / Apache / ISC / OFL
material may be used as a dependency or ported with attribution; GPL, LGPL,
AGPL, unlicensed and Microsoft/Nullsoft proprietary material is
**reference only** (studied, never copied).

## 1. MilkDrop lineage

| Project | Licence | Decision |
| --- | --- | --- |
| [jberg/butterchurn](https://github.com/jberg/butterchurn) 2.6.7 | MIT | **npm dependency.** WebGL2 MilkDrop 2 renderer; `createVisualizer / connectAudio / loadPreset(blend) / setRendererSize / render / launchSongTitleAnim`. Stable 2.x chosen over the 3.0 beta (ESM + WASM EEL) because it is the version proven in production and its presets are the larger set. |
| [jberg/butterchurn-presets](https://github.com/jberg/butterchurn-presets) 2.4.7 | MIT (packaging) | **npm dependency.** Packs base (100), MD1 (87), extra (146), extra2 (122) loaded lazily; 395 unique presets. Preset authors stay in the preset names. |
| [captbaritone/webamp](https://github.com/captbaritone/webamp) Milkdrop window | MIT | **Ported constants**: 15 s auto-cycle while playing, 2.7 s blend for automatic and 5.7 s for user-chosen transitions, 0 s first load, Backspace = history, T = song title, double-click = fullscreen. |
| Nullsoft MilkDrop 2.25c source | BSD-3-Clause (per-file headers) | Reference for band formulas; ns-eel2 is zlib-style. |
| projectM, milkshake | LGPL-2.1 | Reference only. |
| projectM "cream of the crop" (9,795 .milk) | "assumed public domain", no licence | Not shipped. Could be batch-converted later with jberg/milkdrop-preset-converter (MIT). |
| MilkDrop 3 | BSD code, partly closed presets | Reference only. |

Verified pitfalls: Butterchurn needs WebGL2 (`butterchurn/lib/isSupported.min`),
never resumes the AudioContext itself, has no dispose (we drop the canvas and
lose the GL context), and its UMD bundle references `window` (fine in the
browser, not in Node tests).

## 2. Winamp classic visualiser and AVS

| Project | Licence | Decision |
| --- | --- | --- |
| Webamp `VisPainter.ts` + `FFTNullsoft.ts` | MIT | **Vendored/ported** (`src/vis/winamp/`, `src/vis/modes/winamp.ts`): Nullsoft FFT with Hann envelope and log10 equalize tilt; 75 columns mapped with the 0.09 linear / 0.91 log blend; bar falloff 12/16 px per frame; peaks in 8.8 fixed point with velocity 3.0 × 1.1 per frame; wide bands = 4 columns averaged, 4th blank; oscilloscope `y = round(byte/16·2) − 9`, five-colour table, lines/dots/solid; idle bouncing bar. |
| WACUP/vis_classic | MIT + Nullsoft BSD FFT | Origin of the FFT; attribution kept. |
| Winamp legacy source (2024 release) | Winamp Collaborative License | **Not used** (non-free). Only its documented constants were compared. |
| azeem/webvs, visbot/webvs-esm | MIT | Studied as the AVS specification (SuperScope contract, effect list). Not vendored: WebGL1, unmaintained toolchain, 1.5 MB. The **AVS** mode re-implements the ideas in WebGL2. |
| visbot/vis_avs, grandchild/vis_avs | BSD-3-Clause | Reference for Render/Simple, colour cycling (64 frames per colour), beat detector, Timescope. |
| geissomatik/geiss | BSD-3-Clause | Reference for the **Geiss** mode: per-mode warp fields (flat zoom, tunnel, sphere, diamond, hourglass, hall of mirrors, phonic rings, swirl, 1/r zoom, split-world…), 30 Hz motion ticks, palette morphing. |
| fndn-aus/winamp-visualiser | no licence | Not used. |

## 3. Windows Media Player visualisations

| Project | Licence | Decision |
| --- | --- | --- |
| [Manaiakalani/now-playing](https://github.com/Manaiakalani/now-playing) | MIT | **Ported** to raw WebGL2 (`src/vis/wmp/feedback.ts`): the one-shader feedback engine (displacement modes + ink drawers + palette LUT) that models WMP Battery's CurrentShift / PreShift / PaletteLocked design, its audio envelopes (`x/(0.62+x)` compressor, 0.78/0.22 rise, 0.9/0.1 fall), and the Bars and Waves / Spikes / Particle scenes. Presets from its Ambience, Battery, Alchemy, Plenoptic and Musical Colors tables seeded ours; the missing original preset names were added with our own settings. |
| m1h4/Analyzed (IWMPEffects2 plugin) | MIT | Confirms the WMP data contract: `frequency[2][1024]` linear 20 Hz–22.05 kHz, `waveform[2][1024]`; 32-bar analyser with 15-frame peak hold. |
| WMP visualization wiki (wmpvis.fandom.com) | CC-BY-SA text | Catalogue of every family and preset name, colour cycle of Ambience, behaviour notes (flash white when loud, reverse direction, swapping lines). |
| kugg/wmp-viz-ports (Ghidra decompilations) | none, derivative of Microsoft DLLs | **Rejected** for legal reasons; only the described architecture (low-res feedback + polar hue field) informed Musical Colors. |
| rmellis WMP 8/9 web clones | GPL-2.0, screen-captured video | Rejected. |

Colours were not verifiable from primary Microsoft sources (blocked); they are
tuned by eye to the documented descriptions (Bars yellow-green / green in skin
mode, Spike red & Amoeba green in WMP 7, yellow in WMP 9, Particle
red/purple/blue/cyan, Ambience colour cycle light blue → red → orange → yellow
→ green → cyan → light blue → blue → magenta → pink → purple → peach → gray).

## 4. General visualiser libraries and shaders

| Project | Licence | Decision |
| --- | --- | --- |
| m1el/woscope | MIT | **Ported** beam shader (segment quads, analytic Gaussian-beam integral with erf, afterglow) → **XY Oscilloscope** mode. |
| sandner-art/Audio-Shader-Studio | MIT (shaders) | **Vendored** four shaders and its uniform contract → **Shader Lab**. |
| astrofox-io/astrofox | MIT | Studied (feedback, kaleidoscope, LED, glow shaders); not vendored. |
| hvianna/audioMotion-analyzer | AGPL-3.0 | Reference only (log-band construction, weighting curves, peak gravity). |
| wizgrav/clubber, foobar404/wave.js, vudio, Vissonance, WebAudioSpectrum | MIT | Studied; ideas for binning only. |
| p5.sound (LGPL), kaleidosync (no licence), party-mode (CC-BY-NC) | copyleft / none | Rejected. |

## 5. Audio analysis

Everything in `src/audio/analysis.ts` is original code implementing public
formulas: AnalyserNode capture (fftSize 2048, mono + L + R via a channel
splitter), MilkDrop bass/mid/treb with `imm / longAvg` and `avg / longAvg`
(rates 0.2/0.5 and 0.992, fps-corrected as `rate^(30/fps)`, band edges
20/320/2800/11025 Hz — as in Butterchurn's `audioLevels.js`), log-spaced bars
with attack/release and peak hold, and an energy-variance beat detector after
Frédéric Patin (`C = −0.0025714·V + 1.5142857`, ~1 s history, refractory 220 ms).
Considered but not needed: meyda (MIT, ScriptProcessor-based), web-audio-beat-detector
(MIT, offline BPM), @audio/onset (MIT, spectral flux), AVS beat detector (BSD).

## 6. Player shell

| Topic | Source | Decision |
| --- | --- | --- |
| Tags | Borewit/music-metadata 11 (MIT) | **npm dependency**, `parseBlob(file, {duration:false, skipPostHeaders:true})`; cover art → object URL. jsmediatags/id3js rejected (Node `fs` imports). |
| Local files | local-music-pwa (MIT), browser-fs-access (Apache-2.0) | Patterns re-implemented: `showDirectoryPicker` with `webkitdirectory` fallback, recursive `webkitGetAsEntry` drop handling (readEntries batches), extension filter. |
| Playback | Webamp `media/index.ts` (MIT) | HTMLAudioElement + `createMediaElementSource` once, gain, analysers; AudioContext resumed on the first gesture. |
| Media Session, PWA file handlers | MDN / local-music-pwa | Implemented (`setActionHandler` in try/catch, `file_handlers` + `launchQueue`). |
| Hotkeys | Webamp `hotkeys.ts`, MilkDrop docs | Z X C V B, ←→↑↓, Backspace/T for MilkDrop, double-click fullscreen. |
| Desktop packaging | museeks (Tauri v2, MIT) | Documented path for later: Tauri asset protocol with Range support; not part of this release. |

## 7. Retro UI

DSEG7 Classic (OFL-1.1) for the LED time display. XP.css / 98.css / 7.css (MIT)
were evaluated for an optional Windows-XP chrome but their bundled
"Pixelated MS Sans Serif" is CC-BY-SA, and WMP 9's real frame was custom
artwork, so Lumina keeps its own dark theme. Webamp as an embeddable
"classic Winamp" window (its base skin is Nullsoft artwork, not MIT) remains a
possible opt-in extra.

## What a future version could add

- Butterchurn 3 (WASM EEL, `onlyUseWASM`) and user-imported `.milk` presets via
  milkdrop-preset-converter (MIT).
- Persisting directory handles in IndexedDB and rescanning on start.
- An optional embedded Webamp window and an XP.css-styled skin.
- A Tauri desktop build.
