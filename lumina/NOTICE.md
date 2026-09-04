# Third-party notices

Lumina is MIT licensed (see LICENSE). It stands on the shoulders of the open
source projects below. Copies of licences are reproduced or referenced where
code was vendored or ported. Nothing in this product was taken from the
Atelier repository as it existed before Lumina was started.

## npm dependencies

| Project | Licence | Use |
| --- | --- | --- |
| [Butterchurn](https://github.com/jberg/butterchurn) — Jordan Berg | MIT | WebGL2 implementation of MilkDrop 2; renders the **MilkDrop** mode |
| [butterchurn-presets](https://github.com/jberg/butterchurn-presets) — Jordan Berg | MIT (packaging; the presets themselves are community works by the authors named in each preset title) | MilkDrop preset packs (base, MD1, extra, extra2 — 395 presets) |
| [music-metadata](https://github.com/Borewit/music-metadata) — Borewit | MIT | Reads ID3/Vorbis/MP4/FLAC tags and cover art from local files |

## Vendored or ported code

- **Webamp** — Jordan Eldredge, MIT (https://github.com/captbaritone/webamp).
  `src/vis/winamp/fftNullsoft.ts` is Webamp's TypeScript port of the Nullsoft
  FFT; `src/vis/modes/winamp.ts` ports the bar/peak physics, 75-band mapping,
  colouring modes and oscilloscope colour table of `VisPainter.ts`. MilkDrop
  mode timing (15 s cycle, 2.7 s / 5.7 s transitions, Backspace history, T for
  song title) follows Webamp's Milkdrop window. The Winamp hotkeys Z X C V B
  follow Webamp's `hotkeys.ts`.
- **Nullsoft FFT** (`fft.cpp`, via WACUP/vis_classic) — Copyright 2005-2013
  Nullsoft, Inc., BSD-3-Clause:
  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:
  redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer; redistributions in binary
  form must reproduce the above copyright notice, this list of conditions and
  the following disclaimer in the documentation and/or other materials
  provided with the distribution; neither the name of Nullsoft nor the names
  of its contributors may be used to endorse or promote products derived from
  this software without specific prior written permission. THIS SOFTWARE IS
  PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS
  OR IMPLIED WARRANTIES ARE DISCLAIMED.
- **Now Playing** — Manaiakalani, MIT (https://github.com/Manaiakalani/now-playing,
  commit `ce8edca9ef5b810ee4f96a7b32f9053d57b4654c`, "Initial public release of
  Now Playing", 2026-08-18). Licence text as shipped in that repository:

  > MIT License — Copyright (c) 2026 Manaiakalani. Permission is hereby granted,
  > free of charge, to any person obtaining a copy of this software and
  > associated documentation files (the "Software"), to deal in the Software
  > without restriction, including without limitation the rights to use, copy,
  > modify, merge, publish, distribute, sublicense, and/or sell copies of the
  > Software, and to permit persons to whom the Software is furnished to do so,
  > subject to the following conditions: The above copyright notice and this
  > permission notice shall be included in all copies or substantial portions
  > of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
  > KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  > MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
  > NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
  > DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
  > OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
  > USE OR OTHER DEALINGS IN THE SOFTWARE.

  `src/vis/wmp/feedback.ts` is a raw-WebGL2 port of its three.js
  `FeedbackEngine` (displacement modes and ink drawers) and audio envelopes;
  `src/vis/wmp/presets.ts` starts from its Ambience / Battery / Alchemy /
  Plenoptic / Musical Colors preset data; `wmpBars.ts`, `wmpSpikes.ts` and
  `wmpParticle.ts` follow its Bars and Waves, Spikes and Particle scenes.
- **woscope** — Igor Null & Chad von Nau, MIT (https://github.com/m1el/woscope).
  The XY oscilloscope's beam shader (segment quads with the analytic
  Gaussian-beam integral) is ported to GLSL ES 3.00 in `src/vis/modes/xyscope.ts`.
- **Audio-Shader-Studio** — Daniel Sandner, MIT
  (https://github.com/sandner-art/Audio-Shader-Studio). "Spectrograph Radial",
  "Synthwave Grid", "Plasma Cloud" and "Pulse" in `src/vis/shaders/lab.ts`
  and its uniform contract.
- **DSEG7 Classic** font — keshikan, SIL Open Font License 1.1
  (`public/fonts/DSEG-LICENSE.txt`), used for the LED time display.

## Algorithms re-implemented from open sources (no code copied)

- **MilkDrop 2** — Ryan Geiss / Nullsoft, BSD-3-Clause. The bass/mid/treb
  and attenuated-average formulas in `src/audio/analysis.ts` follow MilkDrop's
  audio levels as implemented by Butterchurn (`audioLevels.js`).
- **Geiss** — Ryan Geiss, BSD-3-Clause (https://github.com/geissomatik/geiss).
  The **Geiss** mode re-creates the palette + motion-vector pixel-warp design
  (per-mode warp fields such as tunnel, sphere, hourglass, phonic rings,
  split-world) in WebGL2.
- **Advanced Visualization Studio** — Nullsoft, BSD-3-Clause
  (https://github.com/grandchild/vis_avs). The **AVS** mode re-creates effect
  lists (Movement, Blur, Fadeout, SuperScope, Render/Simple, Timescope, Bass
  Spin, Starfield, Moving Particle) and its 64-frames-per-colour cycling.
- **Beat detection** — energy-variance threshold after Frédéric Patin,
  "Beat Detection Algorithms" (GameDev.net, 2003).

## MilkDrop preset policy

The bundled MilkDrop presets (via `butterchurn-presets`) are community works
whose authors are named in each preset title; only the conversion and
packaging is MIT. Lumina redistributes them as-is, does not relicense them,
and will remove any preset on request from its author (open an issue in this
repository). No preset image textures are shipped.

## Inspiration only — Windows Media Player tribute policy

Windows Media Player visualizations (Bars and Waves, Ambience, Battery,
Alchemy, Particle, Plenoptic, Spikes, Musical Colors) are re-created from
their documented look and behaviour. Preset names are used as homage to
identify the look being tributed. Colours, motion and timing were authored by
Lumina, or inherited from Now Playing (MIT), by eye from public descriptions;
nothing is measured from, extracted from, or reverse-engineered out of
Microsoft binaries, and no Microsoft code, screenshots or artwork is
redistributed. Of the 74 feedback presets, 22 are inherited unchanged from Now
Playing, 4 were adjusted, and 48 are Lumina's own settings under the original
preset names.
Winamp, MilkDrop, Windows Media Player and Windows are trademarks of their
respective owners and are referenced for identification only.
