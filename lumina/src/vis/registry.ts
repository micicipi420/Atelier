import type { VisualizerMode } from './types';
import { milkdropMode } from './modes/milkdrop';
import { winampMode } from './modes/winamp';
import { geissMode } from './modes/geiss';
import { avsMode } from './modes/avs';
import { xyScopeMode } from './modes/xyscope';
import { wmpBarsMode } from './modes/wmpBars';
import { alchemyMode, ambienceMode, batteryMode, musicalColorsMode, plenopticMode } from './modes/wmpFeedback';
import { wmpSpikesMode } from './modes/wmpSpikes';
import { wmpParticleMode } from './modes/wmpParticle';

/** Order defines the number hotkeys (1..9,0) and the menu order. */
export const modes: VisualizerMode[] = [
  milkdropMode,
  winampMode,
  geissMode,
  avsMode,
  wmpBarsMode,
  ambienceMode,
  batteryMode,
  alchemyMode,
  musicalColorsMode,
  plenopticMode,
  wmpSpikesMode,
  wmpParticleMode,
  xyScopeMode,
];
