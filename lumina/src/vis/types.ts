import type { AudioFrame } from '../audio/analysis';
import type { AudioEngine } from '../audio/engine';

export type VisFamily = 'milkdrop' | 'winamp' | 'wmp' | 'scope' | 'shader';
export type RendererKind = 'butterchurn' | 'webgl2' | 'canvas2d';

export interface VisContext {
  canvas: HTMLCanvasElement;
  /** CSS pixel size */
  width: number;
  height: number;
  dpr: number;
  engine: AudioEngine;
  /** show a transient message (preset name etc.) */
  toast(message: string): void;
}

export interface VisInstance {
  /** Called once with a fresh canvas. */
  init(ctx: VisContext): void | Promise<void>;
  render(frame: AudioFrame, ctx: VisContext): void;
  resize(ctx: VisContext): void;
  destroy(): void;
  /** Sub-presets (e.g. "Bars", "Ocean Mist"). */
  presetCount?(): number;
  presetName?(index?: number): string;
  setPreset?(index: number): void;
  currentPreset?(): number;
  randomPreset?(): void;
  /** Return true if the key was consumed. */
  onKey?(e: KeyboardEvent): boolean;
  /** Called on track change (song title animations etc.) */
  onTrack?(title: string): void;
  /** when true, the mode must not auto-cycle its presets */
  locked?: boolean;
}

export interface VisualizerMode {
  id: string;
  name: string;
  family: VisFamily;
  renderer: RendererKind;
  /** one-line inspiration / description shown in the UI */
  description: string;
  create(): VisInstance;
}
