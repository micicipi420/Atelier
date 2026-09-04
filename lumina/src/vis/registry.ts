import type { VisualizerMode } from './types';
import { milkdropMode } from './modes/milkdrop';
import { winampMode } from './modes/winamp';

/** Order defines the number hotkeys (1..9,0) and the menu order. */
export const modes: VisualizerMode[] = [milkdropMode, winampMode];
