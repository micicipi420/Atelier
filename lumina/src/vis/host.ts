/**
 * VisHost owns the visualizer viewport: creates a canvas per mode (a canvas
 * cannot switch between 2D and WebGL contexts), runs the render loop, handles
 * resizing / fullscreen / hotkeys and shows preset toasts.
 */
import { Analyzer, type AudioFrame } from '../audio/analysis';
import { FFT_SIZE, type AudioEngine } from '../audio/engine';
import type { VisContext, VisInstance, VisualizerMode } from './types';

export type HostEvent = 'mode' | 'preset' | 'fullscreen' | 'fps';

export class VisHost extends EventTarget {
  readonly container: HTMLElement;
  private readonly engine: AudioEngine;
  private readonly analyzer = new Analyzer(FFT_SIZE);
  private modes: VisualizerMode[] = [];
  private modeIndex = -1;
  private instance: VisInstance | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: VisContext | null = null;
  private raf = 0;
  private running = false;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private resizeObs: ResizeObserver;
  private lastFrame: AudioFrame | null = null;
  private fpsEl: HTMLElement | null = null;
  private lastFpsPublish = 0;
  /** when true, no automatic preset cycling in modes that support it */
  lockPreset = false;
  setLock(locked: boolean): void {
    this.lockPreset = locked;
    if (this.instance && 'locked' in this.instance) this.instance.locked = locked;
    this.dispatchEvent(new Event('preset'));
  }
  /** keeps the last frame around for modes/tests */
  get frame(): AudioFrame | null {
    return this.lastFrame;
  }

  constructor(container: HTMLElement, engine: AudioEngine) {
    super();
    this.container = container;
    this.engine = engine;
    this.container.classList.add('vis-host');
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'vis-toast';
    this.toastEl.hidden = true;
    this.container.appendChild(this.toastEl);
    this.resizeObs = new ResizeObserver(() => this.handleResize());
    this.resizeObs.observe(this.container);
    document.addEventListener('fullscreenchange', () => {
      this.container.classList.toggle('is-fullscreen', document.fullscreenElement === this.container);
      this.dispatchEvent(new Event('fullscreen'));
      this.handleResize();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopLoop();
      else if (this.running) this.startLoop();
    });
  }

  register(mode: VisualizerMode): void {
    this.modes.push(mode);
  }
  registerAll(modes: VisualizerMode[]): void {
    for (const m of modes) this.register(m);
  }
  get allModes(): readonly VisualizerMode[] {
    return this.modes;
  }
  get mode(): VisualizerMode | null {
    return this.modes[this.modeIndex] ?? null;
  }
  get modeIdx(): number {
    return this.modeIndex;
  }
  get current(): VisInstance | null {
    return this.instance;
  }

  toast(message: string, ms = 1800): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('show');
      this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 300);
    }, ms);
  }

  setFpsElement(el: HTMLElement | null): void {
    this.fpsEl = el;
  }

  async setMode(index: number): Promise<void> {
    if (!this.modes.length) return;
    const n = ((index % this.modes.length) + this.modes.length) % this.modes.length;
    const mode = this.modes[n]!;
    this.destroyInstance();
    this.modeIndex = n;
    const canvas = document.createElement('canvas');
    canvas.className = 'vis-canvas';
    canvas.dataset.mode = mode.id;
    this.container.insertBefore(canvas, this.toastEl);
    this.canvas = canvas;
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(2, Math.floor(rect.width));
    const height = Math.max(2, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    this.ctx = { canvas, width, height, dpr, engine: this.engine, toast: (m) => this.toast(m) };
    const inst = mode.create();
    this.instance = inst;
    if ('locked' in inst) inst.locked = this.lockPreset;
    try {
      await inst.init(this.ctx);
    } catch (err) {
      console.error(`mode ${mode.id} failed to init`, err);
      this.toast(`${mode.name}: not supported here`);
    }
    if (this.engine.track) inst.onTrack?.(this.trackLabel());
    this.dispatchEvent(new Event('mode'));
    this.dispatchEvent(new Event('preset'));
    if (this.running) this.startLoop();
  }

  async setModeById(id: string): Promise<void> {
    const i = this.modes.findIndex((m) => m.id === id);
    if (i >= 0) await this.setMode(i);
  }
  nextMode(): Promise<void> {
    return this.setMode(this.modeIndex + 1);
  }
  prevMode(): Promise<void> {
    return this.setMode(this.modeIndex - 1);
  }

  nextPreset(): void {
    const i = this.instance;
    if (!i?.setPreset || !i.presetCount) return;
    const n = i.presetCount();
    if (!n) return;
    i.setPreset(((i.currentPreset?.() ?? 0) + 1) % n);
    this.announcePreset();
  }
  prevPreset(): void {
    const i = this.instance;
    if (!i?.setPreset || !i.presetCount) return;
    const n = i.presetCount();
    if (!n) return;
    i.setPreset(((i.currentPreset?.() ?? 0) - 1 + n) % n);
    this.announcePreset();
  }
  randomPreset(): void {
    const i = this.instance;
    if (!i) return;
    if (i.randomPreset) i.randomPreset();
    else if (i.setPreset && i.presetCount) i.setPreset(Math.floor(Math.random() * i.presetCount()));
    this.announcePreset();
  }
  setPreset(index: number): void {
    this.instance?.setPreset?.(index);
    this.announcePreset();
  }
  announcePreset(): void {
    const name = this.instance?.presetName?.();
    if (name) this.toast(name);
    this.dispatchEvent(new Event('preset'));
  }

  trackLabel(): string {
    const t = this.engine.track;
    if (!t) return '';
    return t.artist ? `${t.artist} - ${t.title}` : t.title;
  }
  notifyTrack(): void {
    this.instance?.onTrack?.(this.trackLabel());
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement === this.container) void document.exitFullscreen();
    else void this.container.requestFullscreen?.();
  }
  get isFullscreen(): boolean {
    return document.fullscreenElement === this.container;
  }

  /** Forward hotkeys; returns true if consumed. */
  handleKey(e: KeyboardEvent): boolean {
    if (this.instance?.onKey?.(e)) return true;
    return false;
  }

  start(): void {
    this.running = true;
    this.startLoop();
  }
  stop(): void {
    this.running = false;
    this.stopLoop();
  }

  /** Render a single frame synchronously (used by tests). */
  renderOnce(): AudioFrame {
    const frame = this.captureFrame();
    if (this.instance && this.ctx) this.instance.render(frame, this.ctx);
    return frame;
  }

  private captureFrame(): AudioFrame {
    const ctx = this.engine.context;
    const frame = this.analyzer.capture(
      this.engine.analyser,
      this.engine.analyserL,
      this.engine.analyserR,
      ctx?.sampleRate ?? 44100,
      this.engine.playing,
    );
    this.lastFrame = frame;
    return frame;
  }

  private startLoop(): void {
    this.stopLoop();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const frame = this.captureFrame();
      if (this.instance && this.ctx) {
        try {
          this.instance.render(frame, this.ctx);
        } catch (err) {
          console.error('render error', err);
          this.stopLoop();
        }
      }
      if (this.fpsEl && frame.time - this.lastFpsPublish > 0.5) {
        this.lastFpsPublish = frame.time;
        this.fpsEl.textContent = `${Math.round(frame.fps)} fps`;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }
  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private handleResize(): void {
    if (!this.ctx || !this.canvas) return;
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(2, Math.floor(rect.width));
    const height = Math.max(2, Math.floor(rect.height));
    if (width === this.ctx.width && height === this.ctx.height && dpr === this.ctx.dpr) return;
    this.ctx.width = width;
    this.ctx.height = height;
    this.ctx.dpr = dpr;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.instance?.resize(this.ctx);
  }

  private destroyInstance(): void {
    if (this.instance) {
      try {
        this.instance.destroy();
      } catch (err) {
        console.warn('destroy failed', err);
      }
    }
    this.instance = null;
    if (this.canvas) this.canvas.remove();
    this.canvas = null;
    this.ctx = null;
  }
}
