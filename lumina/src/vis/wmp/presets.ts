/**
 * Preset tables for the WMP "Ambience family" modes. The first entries of
 * Ambience/Battery/Alchemy/Plenoptic/Musical Colors come from Now Playing
 * (MIT, Manaiakalani); the rest fill in the remaining preset names of the
 * original catalogue (per the WMP visualization wiki) with our own settings.
 *
 * shift: 0 swirl · 1 kaleidoscope · 2 radial push · 3 zoom · 4 tiling · 5 ripple
 *        6 twist · 7 up · 8 down · 9 left · 10 right · 11 spiral · 12 bass zoom
 *        13 wave warp · 14 sine drift · 15 funnel · 16 breathe · 17 rotate
 *        18 lateral flow (reverses when loud) · 19 drain
 * draw:  0 blobs · 1 ring · 2 radar · 3 dot grid · 4 burst · 5/6 edge frame
 *        7 sparkles · 8 floor rise · 9 smoke · 10 ribbon · 11 waveform · 12 bass bar
 *        13 wobble ring · 14 facets · 15 lane · 16 X · 17 windmill · 18 bubbles
 *        19 two swapping lines
 */
import type { FeedbackPreset } from './feedback';

type P = Omit<FeedbackPreset, 'kaleidoSlices' | 'flashOnBeat' | 'hueSpeed' | 'ink' | 'shiftStrength'> &
  Partial<Pick<FeedbackPreset, 'kaleidoSlices' | 'flashOnBeat' | 'hueSpeed' | 'ink' | 'shiftStrength'>>;

const p = (x: P): FeedbackPreset => ({ kaleidoSlices: 6, flashOnBeat: false, hueSpeed: 0.02, ink: 1, shiftStrength: 1, ...x });

/** The Ambience colour cycle from the wiki: light blue → red → orange → yellow → green → cyan → light blue → blue → magenta → pink → purple → peach → gray. */
const AMBIENCE_CYCLE = ['#7ec8f0', '#e03030', '#f08030', '#f0d040', '#50c850', '#40e0e0', '#7ec8f0', '#3050e0', '#e040e0', '#f090c0', '#9040c0', '#f0b890', '#a0a0a8'];

export const ambiencePresets: FeedbackPreset[] = [
  p({ id: 'random', name: 'Random', random: true, shift: 0, draw: 11, decay: 0.97, paletteLocked: false, palette: AMBIENCE_CYCLE, hueSpeed: 0.06, shiftStrength: 0.95, flashOnBeat: true, seed: 0.1 }),
  p({ id: 'swirl', name: 'Swirl', shift: 0, draw: 11, decay: 0.968, paletteLocked: false, palette: AMBIENCE_CYCLE, hueSpeed: 0.05, shiftStrength: 1.2, ink: 1.05, flashOnBeat: true, seed: 0.2 }),
  p({ id: 'warp', name: 'Warp', shift: 3, draw: 10, decay: 0.96, paletteLocked: false, palette: ['#12081a', '#6a2d8a', '#ff6b4a', '#ffd36a'], hueSpeed: 0.04, shiftStrength: 1.3, ink: 1.1, seed: 0.77 }),
  p({ id: 'anon', name: 'Anon', shift: 18, draw: 11, decay: 0.962, paletteLocked: false, palette: AMBIENCE_CYCLE, hueSpeed: 0.05, shiftStrength: 1.1, ink: 1.05, seed: 0.35 }),
  p({ id: 'falloff', name: 'Falloff', shift: 8, draw: 11, decay: 0.958, paletteLocked: false, palette: AMBIENCE_CYCLE, hueSpeed: 0.05, shiftStrength: 1.2, ink: 1.1, seed: 0.41 }),
  p({ id: 'water', name: 'Water', shift: 13, draw: 9, decay: 0.976, paletteLocked: true, palette: ['#021018', '#0a3a58', '#2f8fbf', '#b8ecff', '#ffffff'], hueSpeed: 0.01, shiftStrength: 0.75, flashOnBeat: true, seed: 0.14 }),
  p({ id: 'bubble', name: 'Bubble', shift: 7, draw: 18, decay: 0.966, paletteLocked: false, palette: AMBIENCE_CYCLE, hueSpeed: 0.04, shiftStrength: 0.9, ink: 1.1, seed: 0.55 }),
  p({ id: 'dizzy', name: 'Dizzy', shift: 17, draw: 11, decay: 0.962, paletteLocked: false, palette: AMBIENCE_CYCLE, hueSpeed: 0.06, shiftStrength: 1.3, ink: 1.05, seed: 0.62 }),
  p({ id: 'windmill', name: 'Windmill', shift: 11, draw: 17, decay: 0.965, paletteLocked: false, palette: AMBIENCE_CYCLE, hueSpeed: 0.05, shiftStrength: 1.1, ink: 1.1, flashOnBeat: true, seed: 0.7 }),
  p({ id: 'niagara', name: 'Niagara', shift: 7, draw: 8, decay: 0.95, paletteLocked: true, palette: ['#061018', '#14507a', '#4ec4e0', '#e8fbff'], hueSpeed: 0, shiftStrength: 1, ink: 1.15, flashOnBeat: true, seed: 0.31 }),
  p({ id: 'blender', name: 'Blender', shift: 18, draw: 4, decay: 0.96, paletteLocked: false, palette: AMBIENCE_CYCLE, hueSpeed: 0.05, shiftStrength: 1.15, ink: 1.05, seed: 0.83 }),
  p({ id: 'xmarks', name: 'X Marks the Spot', shift: 0, draw: 16, decay: 0.964, paletteLocked: false, palette: AMBIENCE_CYCLE, hueSpeed: 0.05, shiftStrength: 1.1, ink: 1.1, flashOnBeat: true, seed: 0.24 }),
  p({ id: 'downthedrain', name: 'Down the Drain', shift: 19, draw: 19, decay: 0.958, paletteLocked: true, palette: ['#0a0606', '#5a2018', '#d4552a', '#f0d0a0'], hueSpeed: 0, shiftStrength: 1.15, ink: 1.1, seed: 0.48 }),
  p({ id: 'thingus', name: 'Thingus', shift: 11, draw: 0, decay: 0.964, paletteLocked: false, palette: ['#101018', '#3a5080', '#d07040', '#f0e0b0', '#80c8a0'], hueSpeed: 0.035, shiftStrength: 1.25, ink: 1.05, flashOnBeat: true, seed: 0.88 }),
];

export const batteryPresets: FeedbackPreset[] = [
  p({ id: 'randomization', name: 'Randomization', random: true, shift: 1, draw: 1, decay: 0.96, paletteLocked: false, palette: ['#05060a', '#163050', '#2a8f7a', '#e8a04a', '#ff5a3c'], hueSpeed: 0.07, flashOnBeat: true, kaleidoSlices: 8, seed: 0.4 }),
  p({ id: 'brightsphere', name: 'brightsphere', shift: 12, draw: 1, decay: 0.955, paletteLocked: false, palette: ['#0a0c10', '#1c3a5a', '#7ec8e3', '#f4f0d8', '#ffe08a'], hueSpeed: 0.05, shiftStrength: 0.85, ink: 1.2, flashOnBeat: true, seed: 0.12 }),
  p({ id: 'circledance', name: 'dance of the freaky circles', shift: 6, draw: 1, decay: 0.962, paletteLocked: true, palette: ['#04060c', '#1a1040', '#7b2dff', '#c8ff4a', '#f0f6ff'], hueSpeed: 0.02, shiftStrength: 1.15, ink: 1.1, kaleidoSlices: 5, seed: 0.66 }),
  p({ id: 'cominatcha', name: 'cominatcha', shift: 2, draw: 4, decay: 0.958, paletteLocked: true, palette: ['#050308', '#3a1a5a', '#e0407a', '#ffc040', '#fff0d0'], shiftStrength: 1.2, ink: 1.1, flashOnBeat: true, seed: 0.45 }),
  p({ id: 'cottonstar', name: 'cottonstar', shift: 14, draw: 7, decay: 0.972, paletteLocked: true, palette: ['#08060c', '#40305a', '#c0a0d8', '#ffe8f8'], shiftStrength: 0.8, ink: 1.2, seed: 0.19 }),
  p({ id: 'eventhorizon', name: 'event horizon', shift: 3, draw: 2, decay: 0.978, paletteLocked: true, palette: ['#000000', '#1a0505', '#7a1408', '#ff4d1a', '#ffd7a0'], hueSpeed: 0, shiftStrength: 1.25, ink: 0.95, flashOnBeat: true, seed: 0.91 }),
  p({ id: 'gemstonematrix', name: 'gemstonematrix', shift: 1, draw: 14, decay: 0.968, paletteLocked: true, palette: ['#040810', '#104060', '#20c0a0', '#e0ffd0', '#ffffff'], shiftStrength: 1, ink: 1.1, kaleidoSlices: 6, seed: 0.37 }),
  p({ id: 'sepiaswirl', name: 'sepiaswirl', shift: 0, draw: 9, decay: 0.97, paletteLocked: true, palette: ['#0c0804', '#4a3018', '#a07040', '#e8c890', '#fff4e0'], shiftStrength: 1.05, ink: 1.05, seed: 0.58 }),
  p({ id: 'illuminator', name: 'illuminator', shift: 12, draw: 2, decay: 0.96, paletteLocked: true, palette: ['#000000', '#303020', '#e8e060', '#ffffff'], shiftStrength: 1, ink: 1.15, flashOnBeat: true, seed: 0.72 }),
  p({ id: 'kaleidovision', name: 'kaleidovision', shift: 1, draw: 4, decay: 0.97, paletteLocked: true, palette: ['#08010a', '#6b1578', '#ff3366', '#ffcc33', '#33e0ff', '#ffffff'], hueSpeed: 0.01, shiftStrength: 1.2, ink: 1.05, flashOnBeat: true, kaleidoSlices: 8, seed: 0.33 }),
  p({ id: 'chemicalnova', name: 'chemicalnova', shift: 2, draw: 4, decay: 0.955, paletteLocked: false, palette: ['#000000', '#401060', '#ff2080', '#ffb000', '#ffffff'], hueSpeed: 0.05, shiftStrength: 1.3, ink: 1.15, flashOnBeat: true, seed: 0.81 }),
  p({ id: 'lotus', name: 'lotus', shift: 5, draw: 0, decay: 0.974, paletteLocked: true, palette: ['#12020c', '#4a1030', '#c23b7a', '#ffb3d0', '#ffe8f2'], hueSpeed: 0, shiftStrength: 0.9, ink: 1.05, seed: 0.18 }),
  p({ id: 'greenenemy', name: 'green is not your enemy', shift: 6, draw: 10, decay: 0.966, paletteLocked: true, palette: ['#020a04', '#0c4018', '#30c040', '#c0ff80', '#f0fff0'], shiftStrength: 1.1, ink: 1.1, seed: 0.26 }),
  p({ id: 'relativelycalm', name: 'relatively calm', shift: 16, draw: 9, decay: 0.978, paletteLocked: true, palette: ['#06080c', '#20304a', '#6080a8', '#c8d8e8'], shiftStrength: 0.6, ink: 0.9, seed: 0.5 }),
  p({ id: 'smokeorwater', name: 'smoke or water?', shift: 13, draw: 9, decay: 0.972, paletteLocked: true, palette: ['#031018', '#0b3a48', '#3aa8b5', '#d5f4f2', '#8eb0c8'], hueSpeed: 0.008, shiftStrength: 0.8, seed: 0.27 }),
  p({ id: 'spider', name: "spider's last moment...", shift: 11, draw: 3, decay: 0.962, paletteLocked: true, palette: ['#000000', '#202020', '#a0a0a0', '#ffffff'], shiftStrength: 1.2, ink: 1.1, seed: 0.64 }),
  p({ id: 'strawberryaid', name: 'strawberryaid', shift: 5, draw: 13, decay: 0.965, paletteLocked: true, palette: ['#100208', '#701030', '#ff3060', '#ffb0c0', '#fff0f4'], shiftStrength: 1, ink: 1.1, flashOnBeat: true, seed: 0.13 }),
  p({ id: 'theworld', name: 'the world', shift: 17, draw: 1, decay: 0.97, paletteLocked: true, palette: ['#020810', '#104080', '#30a060', '#e0d090', '#ffffff'], shiftStrength: 0.9, ink: 1.05, seed: 0.44 }),
  p({ id: 'tornado', name: 'my tornado is resting', shift: 11, draw: 11, decay: 0.96, paletteLocked: false, palette: ['#0a0c10', '#2c3540', '#8aa0b8', '#e8eef4'], hueSpeed: 0.04, shiftStrength: 1.1, ink: 1.05, flashOnBeat: true, seed: 0.52 }),
  p({ id: 'backtothegroove', name: 'back to the groove', shift: 13, draw: 11, decay: 0.958, paletteLocked: false, palette: ['#080410', '#5020a0', '#ff8020', '#ffe080'], hueSpeed: 0.06, shiftStrength: 1.15, ink: 1.1, flashOnBeat: true, seed: 0.9 }),
];

export const alchemyPresets: FeedbackPreset[] = [
  p({ id: 'random', name: 'Random', random: true, shift: 0, draw: 0, decay: 0.968, paletteLocked: false, palette: ['#081018', '#12304a', '#1f7a6b', '#c45c7a', '#e8a04a', '#f4e4c4'], hueSpeed: 0.045, shiftStrength: 1.05, ink: 1.15, flashOnBeat: true, seed: 0.21 }),
  p({ id: 'classic', name: 'Classic', shift: 0, draw: 0, decay: 0.968, paletteLocked: false, palette: ['#081018', '#12304a', '#1f7a6b', '#c45c7a', '#e8a04a', '#f4e4c4'], hueSpeed: 0.045, shiftStrength: 1.05, ink: 1.15, flashOnBeat: true, seed: 0.21 }),
  p({ id: 'kaleidoscope', name: 'Kaleidoscope', shift: 1, draw: 0, decay: 0.97, paletteLocked: false, palette: ['#080810', '#204080', '#40c0c0', '#f0d060', '#ff6040'], hueSpeed: 0.04, shiftStrength: 1.1, ink: 1.1, kaleidoSlices: 8, seed: 0.3 }),
  p({ id: 'monoliths', name: 'Monoliths', shift: 3, draw: 5, decay: 0.972, paletteLocked: true, palette: ['#050505', '#303038', '#8090a0', '#e0e8f0'], shiftStrength: 1.2, ink: 1, seed: 0.6 }),
  p({ id: 'strangeworld', name: 'Strange World', shift: 11, draw: 14, decay: 0.966, paletteLocked: false, palette: ['#0a0410', '#602080', '#20a0a0', '#f0f060'], hueSpeed: 0.05, shiftStrength: 1.15, ink: 1.1, seed: 0.42 }),
  p({ id: 'museum', name: 'WM Museum', shift: 17, draw: 7, decay: 0.975, paletteLocked: true, palette: ['#080604', '#403020', '#c0a060', '#fff0c0'], shiftStrength: 0.8, ink: 1.1, seed: 0.77 }),
];

export const plenopticPresets: FeedbackPreset[] = [
  p({ id: 'random', name: 'Random', random: true, shift: 5, draw: 1, decay: 0.978, paletteLocked: false, palette: ['#061018', '#0d4a3a', '#2f8f4a', '#d4c44a', '#e07a28'], hueSpeed: 0.03, shiftStrength: 0.7, ink: 0.95, seed: 0.22 }),
  p({ id: 'smokey-circles', name: 'Smokey Circles', shift: 5, draw: 1, decay: 0.978, paletteLocked: false, palette: ['#061018', '#0d4a3a', '#2f8f4a', '#d4c44a', '#e07a28'], hueSpeed: 0.03, shiftStrength: 0.7, ink: 0.95, seed: 0.22 }),
  p({ id: 'smokey-lines', name: 'Smokey Lines', shift: 5, draw: 15, decay: 0.976, paletteLocked: false, palette: ['#081018', '#1a4060', '#5090a0', '#e0d080', '#f09040'], hueSpeed: 0.03, shiftStrength: 0.75, ink: 1, seed: 0.33 }),
  p({ id: 'vox', name: 'Vox', shift: 14, draw: 10, decay: 0.966, paletteLocked: true, palette: ['#0a0614', '#3a1860', '#8a40c8', '#e0a0ff', '#f8e8ff'], hueSpeed: 0.01, shiftStrength: 0.85, ink: 1.05, seed: 0.61 }),
  p({ id: 'flame', name: 'Flame', shift: 7, draw: 8, decay: 0.955, paletteLocked: true, palette: ['#100200', '#701000', '#ff6010', '#ffd040', '#fffce0'], shiftStrength: 1, ink: 1.2, flashOnBeat: true, seed: 0.47 }),
  p({ id: 'fountain', name: 'Fountain', shift: 15, draw: 8, decay: 0.952, paletteLocked: true, palette: ['#12080a', '#7a2018', '#e07030', '#ffd080', '#fff4dc'], hueSpeed: 0, shiftStrength: 1, ink: 1.2, flashOnBeat: true, seed: 0.4 }),
  p({ id: 'spyro', name: 'Spyro', shift: 11, draw: 13, decay: 0.966, paletteLocked: true, palette: ['#08140c', '#1a6030', '#7ad040', '#e8ff8a'], hueSpeed: 0.015, shiftStrength: 1.1, ink: 1, flashOnBeat: true, seed: 0.17 }),
];

export const musicalColorsPresets: FeedbackPreset[] = [
  p({ id: 'night-lights', name: 'Night Lights', shift: 12, draw: 7, decay: 0.982, paletteLocked: true, palette: ['#02040c', '#0a1838', '#f0c060', '#ff7040', '#ffffff'], hueSpeed: 0, shiftStrength: 0.55, ink: 1.15, flashOnBeat: true, seed: 0.73 }),
  p({ id: 'colors-in-motion', name: 'Colors in Motion', shift: 10, draw: 10, decay: 0.96, paletteLocked: false, palette: ['#081020', '#1c4c9a', '#2db36a', '#e8c04a', '#e04a3a'], hueSpeed: 0.08, shiftStrength: 0.9, ink: 1.1, seed: 0.05 }),
  p({ id: 'aurora', name: 'Aurora', shift: 6, draw: 9, decay: 0.976, paletteLocked: true, palette: ['#040818', '#0b2a48', '#1f8f6a', '#7b4ad4', '#c8ffe0'], hueSpeed: 0.012, shiftStrength: 0.7, ink: 0.95, seed: 0.29 }),
  p({ id: 'rhythmic-colors', name: 'Rhythmic Colors', shift: 12, draw: 1, decay: 0.962, paletteLocked: false, palette: ['#100818', '#c02060', '#f0a020', '#40c0f0', '#a0f060'], hueSpeed: 0.09, shiftStrength: 1, ink: 1.1, flashOnBeat: true, seed: 0.15 }),
  p({ id: 'star-power', name: 'Star Power', shift: 3, draw: 7, decay: 0.972, paletteLocked: true, palette: ['#020208', '#202060', '#a0a0ff', '#ffffff'], shiftStrength: 1.2, ink: 1.15, flashOnBeat: true, seed: 0.31 }),
  p({ id: 'electric-green', name: 'Electric Green', shift: 11, draw: 11, decay: 0.962, paletteLocked: true, palette: ['#000800', '#106010', '#30ff40', '#d0ffd0'], shiftStrength: 1.1, ink: 1.15, seed: 0.5 }),
  p({ id: 'soft-fire', name: 'Soft Fire', shift: 7, draw: 4, decay: 0.958, paletteLocked: true, palette: ['#100404', '#6a1408', '#e05018', '#ffb040', '#fff0c8'], hueSpeed: 0, shiftStrength: 0.95, ink: 1.1, flashOnBeat: true, seed: 0.36 }),
  p({ id: 'silky-wave', name: 'Silky Wave', shift: 13, draw: 10, decay: 0.972, paletteLocked: true, palette: ['#080a14', '#304880', '#80b0e0', '#f0f8ff'], shiftStrength: 0.85, ink: 1.05, seed: 0.68 }),
  p({ id: 'cutout', name: 'CutOut', shift: 4, draw: 5, decay: 0.965, paletteLocked: false, palette: ['#000000', '#c03030', '#f0c000', '#3090f0', '#ffffff'], hueSpeed: 0.05, shiftStrength: 1, ink: 1.1, seed: 0.23 }),
  p({ id: 'rolling-fire', name: 'Rolling Fire', shift: 0, draw: 9, decay: 0.962, paletteLocked: true, palette: ['#140200', '#801800', '#ff7000', '#ffe060', '#ffffff'], shiftStrength: 1.15, ink: 1.15, flashOnBeat: true, seed: 0.79 }),
  p({ id: 'water-spray', name: 'Water Spray', shift: 2, draw: 7, decay: 0.968, paletteLocked: true, palette: ['#02080f', '#0a4070', '#40a0e0', '#c0f0ff'], shiftStrength: 1.1, ink: 1.15, seed: 0.41 }),
  p({ id: 'acid-rock', name: 'Acid Rock', shift: 1, draw: 4, decay: 0.962, paletteLocked: false, palette: ['#080008', '#80ff00', '#ff00a0', '#00e0ff', '#ffff00'], hueSpeed: 0.1, shiftStrength: 1.2, ink: 1.15, flashOnBeat: true, kaleidoSlices: 5, seed: 0.87 }),
  p({ id: 'hard-rock', name: 'Hard Rock', shift: 12, draw: 12, decay: 0.95, paletteLocked: true, palette: ['#080000', '#600000', '#ff2020', '#ffb0b0'], shiftStrength: 1.3, ink: 1.25, flashOnBeat: true, seed: 0.11 }),
  p({ id: 'hot-spray', name: 'Hot Spray', shift: 2, draw: 3, decay: 0.96, paletteLocked: true, palette: ['#100400', '#a02000', '#ff9000', '#fff0a0'], shiftStrength: 1.2, ink: 1.15, seed: 0.56 }),
  p({ id: 'yellow-swirl', name: 'Yellow Swirl', shift: 0, draw: 0, decay: 0.966, paletteLocked: true, palette: ['#0c0a00', '#605000', '#f0d020', '#fff8c0'], shiftStrength: 1.1, ink: 1.1, seed: 0.62 }),
  p({ id: 'blue-flame', name: 'Blue Flame', shift: 7, draw: 8, decay: 0.957, paletteLocked: true, palette: ['#000410', '#102080', '#4060ff', '#c0d0ff', '#ffffff'], shiftStrength: 1, ink: 1.2, flashOnBeat: true, seed: 0.34 }),
  p({ id: 'critter-rock', name: 'Critter Rock', shift: 4, draw: 3, decay: 0.962, paletteLocked: false, palette: ['#080808', '#40a040', '#f0a020', '#c040c0', '#ffffff'], hueSpeed: 0.07, shiftStrength: 1, ink: 1.1, seed: 0.93 }),
  p({ id: 'electric-rainbow', name: 'Electric Rainbow', shift: 17, draw: 2, decay: 0.965, paletteLocked: false, palette: ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'], hueSpeed: 0.12, shiftStrength: 1.1, ink: 1.1, flashOnBeat: true, seed: 0.28 }),
  p({ id: 'neon-highway', name: 'Neon Highway', shift: 9, draw: 15, decay: 0.95, paletteLocked: true, palette: ['#05010c', '#2a0860', '#ff2ea6', '#2ef0ff', '#f5e9ff'], hueSpeed: 0.01, shiftStrength: 1.05, ink: 1.15, flashOnBeat: true, seed: 0.58 }),
  p({ id: 'winme-3d', name: 'WinMe 3D', shift: 16, draw: 14, decay: 0.968, paletteLocked: true, palette: ['#04060c', '#204070', '#60a0e0', '#f0f0f0'], shiftStrength: 0.9, ink: 1.05, seed: 0.49 }),
  p({ id: 'ice-crystals', name: 'Ice Crystals', shift: 1, draw: 14, decay: 0.97, paletteLocked: true, palette: ['#071018', '#1a4a68', '#7ec8e8', '#e4f6ff'], hueSpeed: 0, shiftStrength: 0.85, ink: 1, kaleidoSlices: 5, seed: 0.11 }),
];
