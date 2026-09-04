/**
 * MilkDrop mode — powered by Butterchurn (MIT, jberg), the WebGL2 port of
 * Ryan Geiss' MilkDrop 2, with the butterchurn-presets packs (MIT).
 */
import type { ButterchurnVisualizer } from 'butterchurn';
import type { AudioFrame } from '../../audio/analysis';
import type { VisContext, VisInstance, VisualizerMode } from '../types';

interface PresetEntry {
  name: string;
  preset: object;
  pack: string;
}

type PresetPack = { getPresets(): Record<string, object> };

/** The UMD builds expose their API either directly or under `.default`. */
function unwrap<T>(mod: unknown, probe: string): T {
  const m = mod as Record<string, unknown>;
  if (m && typeof (m as Record<string, unknown>)[probe] !== 'undefined') return m as T;
  const d = m?.default as Record<string, unknown> | undefined;
  if (d && typeof d[probe] !== 'undefined') return d as T;
  const dd = d?.default as Record<string, unknown> | undefined;
  if (dd && typeof dd[probe] !== 'undefined') return dd as T;
  throw new Error(`cannot find ${probe} in module`);
}

async function loadPack(importer: () => Promise<unknown>, pack: string): Promise<PresetEntry[]> {
  const mod = await importer();
  const api = unwrap<PresetPack>(mod, 'getPresets');
  return Object.entries(api.getPresets()).map(([name, preset]) => ({ name, preset, pack }));
}

export const MILKDROP_SETTINGS_KEY = 'lumina.milkdrop';
/** Transition length when the user explicitly picks a preset (Webamp's USER_PRESET). */
export const USER_BLEND_SECONDS = 5.7;

interface MilkdropSettings {
  cycleSeconds: number;
  blendSeconds: number;
  allPacks: boolean;
  lastPreset?: string;
}

function loadSettings(): MilkdropSettings {
  try {
    const raw = localStorage.getItem(MILKDROP_SETTINGS_KEY);
    if (raw) return { cycleSeconds: 15, blendSeconds: 2.7, allPacks: true, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { cycleSeconds: 15, blendSeconds: 2.7, allPacks: true };
}

export class MilkdropVis implements VisInstance {
  private vis: ButterchurnVisualizer | null = null;
  private presets: PresetEntry[] = [];
  private index = -1;
  private history: number[] = [];
  private lastSwitch = 0;
  private playClock = 0;
  private node: AudioNode | null = null;
  private ctx: VisContext | null = null;
  private settings = loadSettings();
  private destroyed = false;
  private lastTitle = '';
  /** when true the host asked us not to auto-cycle */
  locked = false;

  async init(ctx: VisContext): Promise<void> {
    this.ctx = ctx;
    const supportedMod = await import('butterchurn/lib/isSupported.min');
    const isSupported = (typeof supportedMod === 'function' ? supportedMod : (supportedMod as { default: () => boolean }).default) as () => boolean;
    if (!isSupported()) throw new Error('WebGL2 is required for MilkDrop');
    const bcMod = await import('butterchurn');
    const bc = unwrap<{ createVisualizer: (c: AudioContext, canvas: HTMLCanvasElement, o: object) => ButterchurnVisualizer }>(bcMod, 'createVisualizer');
    if (this.destroyed) return;
    const audioCtx = ctx.engine.ensureContext();
    // Butterchurn's output viewport is exactly width×height; pixelRatio only supersamples the
    // internal textures, so pass the canvas' device-pixel size with pixelRatio 1 (else HiDPI
    // screens would only get the top-left quadrant filled).
    this.vis = bc.createVisualizer(audioCtx, ctx.canvas, {
      width: ctx.canvas.width,
      height: ctx.canvas.height,
      pixelRatio: 1,
      textureRatio: 1,
    });
    this.node = ctx.engine.tapNode;
    if (this.node) this.vis.connectAudio(this.node);

    const main = await loadPack(() => import('butterchurn-presets'), 'main');
    if (this.destroyed) return;
    this.presets = main;
    const saved = this.settings.lastPreset ? this.presets.findIndex((p) => p.name === this.settings.lastPreset) : -1;
    this.setPreset(saved >= 0 ? saved : Math.floor(Math.random() * this.presets.length), 0);
    if (this.lastTitle) this.vis.launchSongTitleAnim(this.lastTitle);
    if (this.settings.allPacks) void this.loadExtraPacks();
  }

  private async loadExtraPacks(): Promise<void> {
    const packs: [string, () => Promise<unknown>][] = [
      ['md1', () => import('butterchurn-presets/lib/butterchurnPresetsMD1.min')],
      ['extra', () => import('butterchurn-presets/lib/butterchurnPresetsExtra.min')],
      ['extra2', () => import('butterchurn-presets/lib/butterchurnPresetsExtra2.min')],
    ];
    for (const [pack, importer] of packs) {
      try {
        const entries = await loadPack(importer, pack);
        if (this.destroyed) return;
        const known = new Set(this.presets.map((p) => p.name));
        for (const e of entries) if (!known.has(e.name)) this.presets.push(e);
      } catch (err) {
        console.warn('failed to load preset pack', pack, err);
      }
    }
  }

  render(frame: AudioFrame): void {
    if (!this.vis) return;
    // Webamp cycles presets every 15 s of *playing* time only.
    if (frame.active) this.playClock += frame.dt;
    if (frame.active && !this.locked && this.presets.length > 1 && this.playClock - this.lastSwitch > this.settings.cycleSeconds) {
      this.randomPreset(this.settings.blendSeconds);
      this.ctx?.toast(this.presetName());
    }
    this.vis.render();
  }

  resize(ctx: VisContext): void {
    this.vis?.setRendererSize(ctx.canvas.width, ctx.canvas.height, { pixelRatio: 1, textureRatio: 1 });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.vis && this.node) {
      try {
        this.vis.disconnectAudio(this.node);
      } catch {
        /* ignore */
      }
    }
    const gl = this.ctx?.canvas.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.vis = null;
  }

  presetCount(): number {
    return this.presets.length;
  }
  presetName(index = this.index): string {
    const p = this.presets[index];
    return p ? p.name : 'loading presets…';
  }
  currentPreset(): number {
    return this.index;
  }
  setPreset(index: number, blend = USER_BLEND_SECONDS): void {
    if (!this.vis || !this.presets.length) return;
    const n = ((index % this.presets.length) + this.presets.length) % this.presets.length;
    const entry = this.presets[n]!;
    if (this.index >= 0 && this.index !== n) this.history.push(this.index);
    if (this.history.length > 64) this.history.shift();
    this.index = n;
    this.lastSwitch = this.playClock;
    try {
      this.vis.loadPreset(entry.preset, blend);
    } catch (err) {
      console.warn('preset failed', entry.name, err);
    }
    this.settings.lastPreset = entry.name;
    try {
      localStorage.setItem(MILKDROP_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }
  /** Webamp: 2.7 s for automatic transitions, 5.7 s when the user picks. */
  randomPreset(blend = USER_BLEND_SECONDS): void {
    if (this.presets.length < 2) return;
    let n = this.index;
    while (n === this.index) n = Math.floor(Math.random() * this.presets.length);
    this.setPreset(n, blend);
  }
  /** Go back through the history (MilkDrop's Backspace). */
  previousInHistory(): void {
    const prev = this.history.pop();
    if (prev !== undefined) {
      const cur = this.index;
      this.setPreset(prev);
      this.history.pop(); // setPreset pushed `cur`; drop it
      void cur;
    }
  }
  onKey(e: KeyboardEvent): boolean {
    if (e.key === 'Backspace') {
      this.previousInHistory();
      this.ctx?.toast(this.presetName());
      return true;
    }
    if (e.key === 't' || e.key === 'T') {
      if (this.lastTitle) this.vis?.launchSongTitleAnim(this.lastTitle);
      return true;
    }
    return false;
  }
  onTrack(title: string): void {
    this.lastTitle = title;
    if (title) this.vis?.launchSongTitleAnim(title);
  }
  setCycleSeconds(s: number): void {
    this.settings.cycleSeconds = s;
  }
}

export const milkdropMode: VisualizerMode = {
  id: 'milkdrop',
  name: 'MilkDrop',
  family: 'milkdrop',
  renderer: 'butterchurn',
  description: 'Winamp MilkDrop 2 presets rendered by Butterchurn (WebGL2)',
  create: () => new MilkdropVis(),
};
