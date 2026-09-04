/**
 * AudioEngine — owns the AudioContext and the playback graph.
 *
 *   <audio> ─► MediaElementAudioSourceNode ─► GainNode ─► destination
 *                                              ├─► AnalyserNode (mono mix, for spectrum / waveform)
 *                                              └─► ChannelSplitter ─► AnalyserNode L
 *                                                                  └─► AnalyserNode R
 *
 * Visualizers that need their own tap (Butterchurn) connect to `engine.tapNode`.
 * The AudioContext is created lazily and resumed on the first user gesture,
 * because browsers keep it suspended until then.
 */
import type { Track } from '../library/types';

export type EngineEvent =
  | 'play'
  | 'pause'
  | 'ended'
  | 'timeupdate'
  | 'durationchange'
  | 'trackchange'
  | 'volumechange'
  | 'error';

export const FFT_SIZE = 2048;

export class AudioEngine extends EventTarget {
  readonly el: HTMLAudioElement;
  private _ctx: AudioContext | null = null;
  private _source: MediaElementAudioSourceNode | null = null;
  private _gain: GainNode | null = null;
  private _analyser: AnalyserNode | null = null;
  private _analyserL: AnalyserNode | null = null;
  private _analyserR: AnalyserNode | null = null;
  private _objectUrl: string | null = null;
  private _track: Track | null = null;
  private _volume = 0.8;
  private _muted = false;

  constructor() {
    super();
    this.el = document.createElement('audio');
    this.el.preload = 'auto';
    this.el.crossOrigin = 'anonymous';
    this.el.volume = this._volume;
    const forward = (type: EngineEvent) => () => this.dispatchEvent(new Event(type));
    this.el.addEventListener('play', forward('play'));
    this.el.addEventListener('pause', forward('pause'));
    this.el.addEventListener('ended', forward('ended'));
    this.el.addEventListener('timeupdate', forward('timeupdate'));
    this.el.addEventListener('durationchange', forward('durationchange'));
    this.el.addEventListener('error', forward('error'));
  }

  /** Create the Web Audio graph. Must be called from a user gesture the first time. */
  ensureContext(): AudioContext {
    if (this._ctx) {
      if (this._ctx.state === 'suspended') void this._ctx.resume();
      return this._ctx;
    }
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this._ctx = ctx;
    this._source = ctx.createMediaElementSource(this.el);
    this._gain = ctx.createGain();
    this._gain.gain.value = 1;

    this._analyser = ctx.createAnalyser();
    this._analyser.fftSize = FFT_SIZE;
    this._analyser.smoothingTimeConstant = 0.5;
    this._analyser.minDecibels = -90;
    this._analyser.maxDecibels = -10;

    const splitter = ctx.createChannelSplitter(2);
    this._analyserL = ctx.createAnalyser();
    this._analyserR = ctx.createAnalyser();
    for (const a of [this._analyserL, this._analyserR]) {
      a.fftSize = FFT_SIZE;
      a.smoothingTimeConstant = 0.5;
    }

    this._source.connect(this._gain);
    this._gain.connect(ctx.destination);
    this._gain.connect(this._analyser);
    this._gain.connect(splitter);
    splitter.connect(this._analyserL, 0);
    splitter.connect(this._analyserR, 1);
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  get context(): AudioContext | null {
    return this._ctx;
  }
  /** Node that visualizers with their own analysers (Butterchurn) should connect to. */
  get tapNode(): AudioNode | null {
    return this._gain;
  }
  get analyser(): AnalyserNode | null {
    return this._analyser;
  }
  get analyserL(): AnalyserNode | null {
    return this._analyserL;
  }
  get analyserR(): AnalyserNode | null {
    return this._analyserR;
  }
  get track(): Track | null {
    return this._track;
  }
  get playing(): boolean {
    return !this.el.paused && !this.el.ended;
  }
  get currentTime(): number {
    return this.el.currentTime;
  }
  get duration(): number {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0;
  }
  get volume(): number {
    return this._volume;
  }
  get muted(): boolean {
    return this._muted;
  }

  load(track: Track, autoplay = true): void {
    if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
    this._objectUrl = null;
    this._track = track;
    let src: string;
    if (track.file) {
      this._objectUrl = URL.createObjectURL(track.file);
      src = this._objectUrl;
    } else {
      src = track.url ?? '';
    }
    this.el.src = src;
    this.dispatchEvent(new Event('trackchange'));
    if (autoplay) void this.play();
  }

  /** Stop and forget the current track (e.g. when the playlist is cleared). */
  unload(): void {
    this.el.pause();
    if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
    this._objectUrl = null;
    this._track = null;
    this.el.removeAttribute('src');
    this.el.load();
    this.dispatchEvent(new Event('trackchange'));
  }

  async play(): Promise<void> {
    this.ensureContext();
    if (!this.el.src) return;
    try {
      await this.el.play();
    } catch (err) {
      // Autoplay policies or unsupported format — surface as error event.
      this.dispatchEvent(new Event('error'));
      console.warn('play() failed', err);
    }
  }
  pause(): void {
    this.el.pause();
  }
  toggle(): void {
    if (this.playing) this.pause();
    else void this.play();
  }
  stop(): void {
    this.el.pause();
    this.el.currentTime = 0;
  }
  seek(seconds: number): void {
    const d = this.duration;
    this.el.currentTime = Math.max(0, d ? Math.min(d, seconds) : seconds);
  }
  seekBy(delta: number): void {
    this.seek(this.el.currentTime + delta);
  }
  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    this.el.volume = this._muted ? 0 : this._volume;
    this.dispatchEvent(new Event('volumechange'));
  }
  setMuted(m: boolean): void {
    this._muted = m;
    this.el.volume = m ? 0 : this._volume;
    this.dispatchEvent(new Event('volumechange'));
  }
  toggleMute(): void {
    this.setMuted(!this._muted);
  }
}
