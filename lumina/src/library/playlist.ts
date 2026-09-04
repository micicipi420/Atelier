import type { RepeatMode, Track } from './types';

export type PlaylistEvent = 'change' | 'current' | 'mode';

/** Ordered queue with shuffle/repeat semantics. */
export class Playlist extends EventTarget {
  tracks: Track[] = [];
  private _index = -1;
  private _shuffle = false;
  private _repeat: RepeatMode = 'off';
  private order: number[] = [];
  private orderPos = -1;

  get index(): number {
    return this._index;
  }
  get current(): Track | null {
    return this.tracks[this._index] ?? null;
  }
  get shuffle(): boolean {
    return this._shuffle;
  }
  get repeat(): RepeatMode {
    return this._repeat;
  }
  get length(): number {
    return this.tracks.length;
  }

  private emit(type: PlaylistEvent) {
    this.dispatchEvent(new Event(type));
  }

  add(tracks: Track[]): void {
    if (!tracks.length) return;
    this.tracks.push(...tracks);
    if (this._shuffle) this.reshuffle();
    this.emit('change');
  }

  replace(tracks: Track[]): void {
    this.tracks = tracks.slice();
    this._index = -1;
    if (this._shuffle) this.reshuffle();
    this.emit('change');
  }

  remove(index: number): void {
    if (index < 0 || index >= this.tracks.length) return;
    const t = this.tracks[index]!;
    if (t.coverUrl) URL.revokeObjectURL(t.coverUrl);
    this.tracks.splice(index, 1);
    if (index < this._index) this._index--;
    else if (index === this._index) this._index = Math.min(this._index, this.tracks.length - 1);
    if (this._shuffle) this.reshuffle();
    this.emit('change');
  }

  clear(): void {
    for (const t of this.tracks) if (t.coverUrl) URL.revokeObjectURL(t.coverUrl);
    this.tracks = [];
    this._index = -1;
    this.order = [];
    this.orderPos = -1;
    this.emit('change');
    this.emit('current');
  }

  move(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.tracks.length || to >= this.tracks.length) return;
    const [t] = this.tracks.splice(from, 1);
    this.tracks.splice(to, 0, t!);
    if (this._index === from) this._index = to;
    else if (from < this._index && to >= this._index) this._index--;
    else if (from > this._index && to <= this._index) this._index++;
    this.emit('change');
  }

  setCurrent(index: number): Track | null {
    if (index < 0 || index >= this.tracks.length) return null;
    this._index = index;
    if (this._shuffle) {
      const pos = this.order.indexOf(index);
      if (pos >= 0) this.orderPos = pos;
    }
    this.emit('current');
    return this.current;
  }

  /** Next track for manual skip (wraps regardless of repeat mode). */
  next(): Track | null {
    if (!this.tracks.length) return null;
    if (this._shuffle) {
      if (!this.order.length) this.reshuffle();
      this.orderPos = (this.orderPos + 1) % this.order.length;
      return this.setCurrent(this.order[this.orderPos]!);
    }
    return this.setCurrent((this._index + 1) % this.tracks.length);
  }

  prev(): Track | null {
    if (!this.tracks.length) return null;
    if (this._shuffle) {
      if (!this.order.length) this.reshuffle();
      this.orderPos = (this.orderPos - 1 + this.order.length) % this.order.length;
      return this.setCurrent(this.order[this.orderPos]!);
    }
    return this.setCurrent((this._index - 1 + this.tracks.length) % this.tracks.length);
  }

  /** Track to play when the current one ends; null means stop. */
  afterEnd(): Track | null {
    if (!this.tracks.length) return null;
    if (this._repeat === 'one') return this.current;
    const atEnd = this._shuffle ? this.orderPos >= this.order.length - 1 : this._index >= this.tracks.length - 1;
    if (atEnd && this._repeat === 'off') return null;
    return this.next();
  }

  setShuffle(on: boolean): void {
    this._shuffle = on;
    if (on) this.reshuffle();
    this.emit('mode');
  }
  toggleShuffle(): void {
    this.setShuffle(!this._shuffle);
  }
  cycleRepeat(): RepeatMode {
    this._repeat = this._repeat === 'off' ? 'all' : this._repeat === 'all' ? 'one' : 'off';
    this.emit('mode');
    return this._repeat;
  }
  setRepeat(mode: RepeatMode): void {
    this._repeat = mode;
    this.emit('mode');
  }

  private reshuffle(): void {
    const n = this.tracks.length;
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    // keep the current track first so "next" continues from here
    if (this._index >= 0) {
      const pos = order.indexOf(this._index);
      if (pos > 0) [order[0], order[pos]] = [order[pos]!, order[0]!];
      this.orderPos = 0;
    } else {
      this.orderPos = -1;
    }
    this.order = order;
  }
}
