import { FeedbackVis } from '../wmp/feedback';
import { alchemyPresets, ambiencePresets, batteryPresets, musicalColorsPresets, plenopticPresets } from '../wmp/presets';
import type { VisualizerMode } from '../types';

export const ambienceMode: VisualizerMode = {
  id: 'wmp-ambience',
  name: 'WMP · Ambience',
  family: 'wmp',
  renderer: 'webgl2',
  description: 'Windows Media Player 7-10 "Ambience": video-feedback swirls with the light-blue → red → … colour cycle, flashing on loud passages',
  create: () => new FeedbackVis(ambiencePresets, 'lumina.wmp.ambience'),
};
export const batteryMode: VisualizerMode = {
  id: 'wmp-battery',
  name: 'WMP · Battery',
  family: 'wmp',
  renderer: 'webgl2',
  description: 'Windows Media Player 8-12 "Battery" (the XP default): displacement + ink presets like Randomization, brightsphere, kaleidovision, event horizon',
  create: () => new FeedbackVis(batteryPresets, 'lumina.wmp.battery'),
};
export const alchemyMode: VisualizerMode = {
  id: 'wmp-alchemy',
  name: 'WMP · Alchemy',
  family: 'wmp',
  renderer: 'webgl2',
  description: 'Windows Media Player 9 "Alchemy" and the 3D Alchemy creativity-pack presets',
  create: () => new FeedbackVis(alchemyPresets, 'lumina.wmp.alchemy'),
};
export const plenopticMode: VisualizerMode = {
  id: 'wmp-plenoptic',
  name: 'WMP · Plenoptic',
  family: 'wmp',
  renderer: 'webgl2',
  description: 'Windows Media Player 7-10 "Plenoptic": paint-like smokey circles, lines, flame, fountain, spyro',
  create: () => new FeedbackVis(plenopticPresets, 'lumina.wmp.plenoptic'),
};
export const musicalColorsMode: VisualizerMode = {
  id: 'wmp-musical-colors',
  name: 'WMP · Musical Colors',
  family: 'wmp',
  renderer: 'webgl2',
  description: 'Windows Media Player 7/8 "Musical Colors" (Averett & Associates): Night Lights, Aurora, Neon Highway, Electric Rainbow …',
  create: () => new FeedbackVis(musicalColorsPresets, 'lumina.wmp.musicalcolors'),
};
