# Third-party notices

Lumina is MIT licensed (see LICENSE). It stands on the shoulders of the open
source projects below. Copies of their licences are included where code was
vendored or ported.

## Dependencies (npm)

| Project | Licence | Use |
| --- | --- | --- |
| [Butterchurn](https://github.com/jberg/butterchurn) — Jordan Berg | MIT | WebGL2 implementation of MilkDrop 2; renders the "MilkDrop" mode |
| [butterchurn-presets](https://github.com/jberg/butterchurn-presets) | MIT (packaging; presets by their named authors, community-shared) | MilkDrop preset packs (base, MD1, extra, extra2) |
| [music-metadata](https://github.com/Borewit/music-metadata) — Borewit | MIT | Reads ID3/Vorbis/MP4/FLAC tags and cover art from local files |

## Vendored / ported code

- **Webamp** — Jordan Eldredge, MIT. `src/vis/winamp/fftNullsoft.ts` is Webamp's
  TypeScript port of the Nullsoft FFT; the Winamp-classic painter in
  `src/vis/modes/winamp.ts` ports the bar/peak physics, band mapping, colouring
  modes and oscilloscope colour table of `VisPainter.ts`. MilkDrop mode timing
  constants (15 s cycle, 2.7 s / 5.7 s transitions) follow Webamp's Milkdrop window.
- **Nullsoft FFT** (`fft.cpp`, via WACUP/vis_classic) — Copyright 2005-2013
  Nullsoft, Inc., BSD-3-Clause. Redistribution and use in source and binary
  forms, with or without modification, are permitted provided that the above
  copyright notice, this list of conditions and the following disclaimer are
  retained; the name of Nullsoft may not be used to endorse or promote products
  derived from this software without specific prior written permission. THIS
  SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.
- **MilkDrop** — Ryan Geiss / Nullsoft. The band-tracking formulas in
  `src/audio/analysis.ts` (bass/mid/treb with attenuated averages) re-implement
  MilkDrop 2's audio levels as described by Butterchurn's `audioLevels.js` (MIT).
- **Geiss** — Ryan Geiss, BSD-3-Clause. The "Geiss" mode re-implements the
  palette + motion-vector pixel-warp idea of the original plugin in WebGL2.
- **woscope** — Igor Null & Chad von Nau, MIT. The XY oscilloscope's phosphor
  line rendering follows woscope's segment-quad + Gaussian-beam technique.
- **Beat detection** — energy-variance threshold after Frédéric Patin, "Beat
  Detection Algorithms" (GameDev.net, 2003).

## Inspiration (no code taken)

Windows Media Player visualisations (Bars and Waves, Ambience, Battery,
Alchemy, Particle, Plenoptic, Spikes, Musical Colors) and Winamp AVS are
re-created from their look and public documentation; no Microsoft or Winamp
code is used. Winamp and MilkDrop are trademarks of their respective owners.
