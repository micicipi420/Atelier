/**
 * Turns Files / DataTransfer items / directory handles into Track objects and
 * reads their tags in the background with music-metadata (MIT, Borewit).
 */
import type { Track } from './types';
import { isAudioFile } from './types';

let idCounter = 0;
const nextId = () => `t${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** "01 - Artist - Title.mp3" → { artist, title } best effort */
export function guessFromFileName(fileName: string): { title: string; artist: string; trackNo?: number } {
  const base = fileName.replace(/\.[^.]+$/, '');
  let rest = base;
  let trackNo: number | undefined;
  const m = /^\s*(\d{1,3})\s*[-._ ]+\s*(.+)$/.exec(rest);
  if (m) {
    trackNo = parseInt(m[1]!, 10);
    rest = m[2]!;
  }
  const parts = rest.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0]!.trim(), title: parts.slice(1).join(' - ').trim(), trackNo };
  }
  return { artist: '', title: rest.trim(), trackNo };
}

export function trackFromFile(file: File): Track {
  const g = guessFromFileName(file.name);
  return {
    id: nextId(),
    file,
    title: g.title || file.name,
    artist: g.artist,
    album: '',
    trackNo: g.trackNo,
    tagged: false,
    fileName: file.name,
    size: file.size,
  };
}

export function trackFromUrl(url: string, meta: Partial<Track> = {}): Track {
  const name = decodeURIComponent(url.split('/').pop() ?? url);
  const g = guessFromFileName(name);
  return {
    id: nextId(),
    url,
    title: meta.title ?? g.title,
    artist: meta.artist ?? g.artist,
    album: meta.album ?? '',
    tagged: true,
    fileName: name,
    size: 0,
    ...meta,
  };
}

function sortByPath(files: { path: string; file: File }[]) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  files.sort((a, b) => collator.compare(a.path, b.path));
}

/** Files from an <input type=file> (optionally with webkitdirectory). */
export function tracksFromFileList(list: FileList | File[]): Track[] {
  const entries: { path: string; file: File }[] = [];
  for (const f of Array.from(list)) {
    if (!isAudioFile(f.name, f.type)) continue;
    entries.push({ path: f.webkitRelativePath || f.name, file: f });
  }
  sortByPath(entries);
  return entries.map((e) => trackFromFile(e.file));
}

type FSEntry = FileSystemEntry & {
  isFile: boolean;
  isDirectory: boolean;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (cb: (entries: FSEntry[]) => void, err?: (e: unknown) => void) => void };
};

async function walkEntry(entry: FSEntry, prefix: string, out: { path: string; file: File }[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((res, rej) => entry.file!(res, rej));
    if (isAudioFile(file.name, file.type)) out.push({ path: prefix + file.name, file });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns batches; keep reading until empty
    for (;;) {
      const batch = await new Promise<FSEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walkEntry(e, prefix + entry.name + '/', out);
    }
  }
}

/** Files and folders dropped onto the window. */
export async function tracksFromDataTransfer(dt: DataTransfer): Promise<Track[]> {
  const out: { path: string; file: File }[] = [];
  const items = Array.from(dt.items ?? []);
  let usedEntries = false;
  for (const item of items) {
    const anyItem = item as DataTransferItem & { webkitGetAsEntry?: () => FSEntry | null };
    const entry = anyItem.webkitGetAsEntry?.();
    if (entry) {
      usedEntries = true;
      await walkEntry(entry, '', out);
    }
  }
  if (!usedEntries) {
    for (const f of Array.from(dt.files)) if (isAudioFile(f.name, f.type)) out.push({ path: f.name, file: f });
  }
  sortByPath(out);
  return out.map((e) => trackFromFile(e.file));
}

/** File System Access API directory picker (Chromium). */
export async function tracksFromDirectoryPicker(): Promise<Track[] | null> {
  const w = window as unknown as { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> };
  if (!w.showDirectoryPicker) return null;
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await w.showDirectoryPicker({ mode: 'read' });
  } catch {
    return [];
  }
  const out: { path: string; file: File }[] = [];
  async function walk(handle: FileSystemDirectoryHandle, prefix: string, depth: number) {
    if (depth > 12) return;
    const iter = (handle as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values();
    for await (const h of iter) {
      if (h.kind === 'file') {
        const file = await (h as FileSystemFileHandle).getFile();
        if (isAudioFile(file.name, file.type)) out.push({ path: prefix + file.name, file });
      } else if (h.kind === 'directory') {
        await walk(h as FileSystemDirectoryHandle, prefix + h.name + '/', depth + 1);
      }
    }
  }
  await walk(dir, '', 0);
  sortByPath(out);
  return out.map((e) => trackFromFile(e.file));
}

/**
 * Read tags with music-metadata. Loaded lazily so the player boots fast.
 * Calls `onUpdate` for every track whose metadata changed.
 */
export async function readTags(tracks: Track[], onUpdate: (t: Track) => void, concurrency = 2): Promise<void> {
  const pending = tracks.filter((t) => t.file && !t.tagged);
  if (!pending.length) return;
  const mm = await import('music-metadata');
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const t = pending[cursor++]!;
      try {
        const meta = await mm.parseBlob(t.file!, { duration: false, skipPostHeaders: true });
        const c = meta.common;
        if (c.title) t.title = c.title;
        if (c.artist) t.artist = c.artist;
        else if (c.artists?.length) t.artist = c.artists.join(', ');
        if (c.album) t.album = c.album;
        if (c.year) t.year = c.year;
        if (c.track?.no) t.trackNo = c.track.no;
        if (meta.format.duration) t.duration = meta.format.duration;
        const pic = c.picture?.[0];
        if (pic) {
          const bytes = pic.data instanceof Uint8Array ? pic.data : new Uint8Array(pic.data as ArrayBuffer);
          const blob = new Blob([bytes as BlobPart], { type: pic.format || 'image/jpeg' });
          t.coverUrl = URL.createObjectURL(blob);
        }
      } catch (err) {
        console.warn('tag read failed for', t.fileName, err);
      }
      t.tagged = true;
      onUpdate(t);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}
