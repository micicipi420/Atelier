import { describe, expect, it } from 'vitest';
import { Playlist } from '../src/library/playlist';
import { guessFromFileName, trackFromUrl } from '../src/library/loader';
import type { Track } from '../src/library/types';
import { isAudioFile } from '../src/library/types';

const mk = (n: number): Track[] => Array.from({ length: n }, (_, i) => trackFromUrl(`http://x/${i + 1} - Artist - Song ${i + 1}.mp3`));

describe('guessFromFileName', () => {
  it('parses "NN - Artist - Title"', () => {
    expect(guessFromFileName('07 - Daft Punk - Digital Love.mp3')).toEqual({ artist: 'Daft Punk', title: 'Digital Love', trackNo: 7 });
  });
  it('falls back to the bare name', () => {
    expect(guessFromFileName('demo.wav')).toEqual({ artist: '', title: 'demo', trackNo: undefined });
  });
});

describe('isAudioFile', () => {
  it('accepts by mime or extension', () => {
    expect(isAudioFile('a.flac')).toBe(true);
    expect(isAudioFile('a.txt')).toBe(false);
    expect(isAudioFile('weird', 'audio/ogg')).toBe(true);
  });
});

describe('Playlist', () => {
  it('walks forward and backward with wrap-around', () => {
    const p = new Playlist();
    p.add(mk(3));
    expect(p.setCurrent(0)?.title).toBe('Song 1');
    expect(p.next()?.title).toBe('Song 2');
    expect(p.next()?.title).toBe('Song 3');
    expect(p.next()?.title).toBe('Song 1');
    expect(p.prev()?.title).toBe('Song 3');
  });
  it('stops at the end unless repeat is on', () => {
    const p = new Playlist();
    p.add(mk(2));
    p.setCurrent(1);
    expect(p.afterEnd()).toBeNull();
    p.setRepeat('all');
    expect(p.afterEnd()?.title).toBe('Song 1');
    p.setRepeat('one');
    expect(p.afterEnd()?.title).toBe('Song 1');
  });
  it('shuffles through every track exactly once per cycle', () => {
    const p = new Playlist();
    p.add(mk(8));
    p.setCurrent(3);
    p.setShuffle(true);
    const seen = new Set<string>([p.current!.id]);
    for (let i = 0; i < 7; i++) seen.add(p.next()!.id);
    expect(seen.size).toBe(8);
  });
  it('keeps the current index stable when removing before it', () => {
    const p = new Playlist();
    p.add(mk(4));
    p.setCurrent(2);
    p.remove(0);
    expect(p.index).toBe(1);
    expect(p.current?.title).toBe('Song 3');
    p.move(1, 0);
    expect(p.index).toBe(0);
  });
});
