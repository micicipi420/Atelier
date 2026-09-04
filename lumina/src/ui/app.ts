/**
 * The player shell: top bar (mode + preset controls), stage (visualizer +
 * playlist), transport bar, overlays, hotkeys, Media Session, drag & drop.
 */
import type { AudioEngine } from '../audio/engine';
import { demoTracks } from '../library/demo';
import { readTags, tracksFromDataTransfer, tracksFromDirectoryPicker, tracksFromFileList } from '../library/loader';
import type { Playlist } from '../library/playlist';
import type { Track } from '../library/types';
import { VisHost } from '../vis/host';
import type { VisualizerMode } from '../vis/types';
import { icons } from './icons';

export interface AppDeps {
  engine: AudioEngine;
  playlist: Playlist;
  modes: VisualizerMode[];
}

interface Settings {
  volume: number;
  muted: boolean;
  modeId: string;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  playlistOpen: boolean;
  lockPreset: boolean;
  showFps: boolean;
}

const SETTINGS_KEY = 'lumina.settings';
const defaults: Settings = {
  volume: 0.8,
  muted: false,
  modeId: 'milkdrop',
  shuffle: false,
  repeat: 'off',
  playlistOpen: true,
  lockPreset: false,
  showFps: false,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...defaults };
}

export function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

const q = <T extends Element>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

const HOTKEYS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Seek 5 s (Shift: 30 s)'],
  ['↑ / ↓', 'Volume'],
  ['Z X C V B', 'Prev · Play · Pause · Stop · Next (Winamp)'],
  ['N / P', 'Next / previous track'],
  ['M / Shift+M', 'Next / previous visualizer'],
  ['1 … 9, 0', 'Pick visualizer'],
  ['[ / ]', 'Previous / next preset'],
  ['R', 'Random preset'],
  ['Backspace', 'Previous preset (MilkDrop history)'],
  ['L', 'Lock preset (stop auto-cycling)'],
  ['K', 'Next colour palette (Winamp Classic)'],
  ['T', 'Show song title (MilkDrop)'],
  ['F / double-click', 'Fullscreen'],
  ['S', 'Shuffle'],
  ['E', 'Repeat mode'],
  ['O / Shift+O', 'Open files / folder'],
  ['D', 'Load demo tracks'],
  ['Tab', 'Toggle playlist'],
  ['H / ?', 'This help'],
];

export function createApp(root: HTMLElement, deps: AppDeps): { host: VisHost } {
  const { engine, playlist, modes } = deps;
  const settings = loadSettings();
  const save = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  };

  root.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand"><img src="./favicon.svg" alt=""><span>Lumina</span></div>
      <div class="mode-bar">
        <button class="icon-btn" data-act="prev-mode" title="Previous visualizer (Shift+M)">${icons.chevronLeft}</button>
        <select data-el="mode-select" aria-label="Visualizer mode"></select>
        <button class="icon-btn" data-act="next-mode" title="Next visualizer (M)">${icons.chevronRight}</button>
        <div class="preset-bar">
          <button class="icon-btn" data-act="prev-preset" title="Previous preset ([)">${icons.chevronLeft}</button>
          <span class="preset-name" data-el="preset-name"></span>
          <button class="icon-btn" data-act="next-preset" title="Next preset (])">${icons.chevronRight}</button>
          <button class="icon-btn" data-act="random-preset" title="Random preset (R)">${icons.dice}</button>
          <button class="icon-btn" data-act="lock-preset" title="Lock preset (L)">${icons.unlock}</button>
        </div>
      </div>
      <div class="topbar-right">
        <span class="fps" data-el="fps"></span>
        <button class="icon-btn" data-act="toggle-playlist" title="Playlist (Tab)">${icons.playlist}</button>
        <button class="icon-btn" data-act="fullscreen" title="Fullscreen (F)">${icons.fullscreen}</button>
        <button class="icon-btn" data-act="help" title="Help (H)">${icons.help}</button>
      </div>
    </header>
    <main class="stage">
      <div class="vis-host" data-el="vis" tabindex="0">
        <div class="vis-overlay" data-el="vis-overlay"><div><div class="title" data-el="ov-title"></div><div class="sub" data-el="ov-sub"></div></div></div>
        <div class="empty-hint" data-el="empty">
          <strong>Drop music here</strong>
          <span>mp3 · m4a · flac · ogg · opus · wav — files or whole folders</span>
          <div class="actions">
            <button class="btn" data-act="open-files">Open files</button>
            <button class="btn" data-act="open-folder">Open folder</button>
            <button class="btn primary" data-act="demo">Play demo</button>
          </div>
        </div>
      </div>
      <aside class="playlist" data-el="playlist">
        <div class="playlist-head">
          <h2>Playlist <span class="count" data-el="count"></span></h2>
          <button class="icon-btn" data-act="open-files" title="Add files (O)">${icons.file}</button>
          <button class="icon-btn" data-act="open-folder" title="Add folder (Shift+O)">${icons.folder}</button>
          <button class="icon-btn" data-act="demo" title="Add demo tracks (D)">${icons.demo}</button>
          <button class="icon-btn" data-act="clear" title="Clear playlist">${icons.trash}</button>
        </div>
        <ul class="playlist-list" data-el="list"></ul>
        <div class="playlist-foot"><span data-el="foot-left"></span><span data-el="foot-right"></span></div>
      </aside>
    </main>
    <footer class="transport">
      <div class="now-playing">
        <div class="cover" data-el="cover">${icons.note}</div>
        <div class="np-text"><div class="np-title" data-el="np-title">Nothing playing</div><div class="np-artist" data-el="np-artist">Open some music to begin</div></div>
      </div>
      <div class="controls">
        <div class="control-row">
          <button class="icon-btn" data-act="shuffle" title="Shuffle (S)">${icons.shuffle}</button>
          <button class="icon-btn" data-act="prev" title="Previous (Z)">${icons.prev}</button>
          <button class="play-btn" data-act="toggle" title="Play / pause (Space)" data-el="play">${icons.play}</button>
          <button class="icon-btn" data-act="next" title="Next (B)">${icons.next}</button>
          <button class="icon-btn" data-act="repeat" title="Repeat (E)">${icons.repeat}</button>
        </div>
        <div class="seek-row">
          <span class="time" data-el="time">0:00</span>
          <input type="range" min="0" max="1000" value="0" step="1" data-el="seek" aria-label="Seek">
          <span class="time" data-el="duration">0:00</span>
        </div>
      </div>
      <div class="volume">
        <button class="icon-btn" data-act="mute" title="Mute">${icons.volume}</button>
        <input type="range" min="0" max="100" value="80" data-el="volume" aria-label="Volume">
      </div>
    </footer>
    <div class="drop-overlay hidden" data-el="drop">Drop to add to playlist</div>
    <div class="help-overlay hidden" data-el="help">
      <div class="help-card">
        <h2>Keyboard</h2>
        <div class="help-grid">${HOTKEYS.map(([k, d]) => `<div><span>${d}</span><kbd>${k}</kbd></div>`).join('')}</div>
        <p class="credits">Lumina is built on open source: <a href="https://github.com/jberg/butterchurn" target="_blank" rel="noopener">Butterchurn</a> (MilkDrop 2 in WebGL, MIT) and its preset packs; the Winamp classic visualiser after <a href="https://github.com/captbaritone/webamp" target="_blank" rel="noopener">Webamp</a> (MIT) with the Nullsoft FFT (BSD); the Windows Media Player families on a WebGL2 port of <a href="https://github.com/Manaiakalani/now-playing" target="_blank" rel="noopener">Now Playing</a> (MIT); the XY scope after <a href="https://github.com/m1el/woscope" target="_blank" rel="noopener">woscope</a> (MIT); Shader Lab shaders from <a href="https://github.com/sandner-art/Audio-Shader-Studio" target="_blank" rel="noopener">Audio-Shader-Studio</a> (MIT); Geiss and AVS modes re-implemented after the BSD-licensed originals; tags via <a href="https://github.com/Borewit/music-metadata" target="_blank" rel="noopener">music-metadata</a> (MIT). MilkDrop by Ryan Geiss / Nullsoft. Full list in NOTICE.md. Press <kbd>Esc</kbd> to close.</p>
      </div>
    </div>
    <input type="file" data-el="file-input" multiple accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.oga,.webm" hidden>
    <input type="file" data-el="dir-input" webkitdirectory directory multiple hidden>
  </div>`;

  const el = {
    vis: q<HTMLElement>(root, '[data-el=vis]'),
    overlay: q<HTMLElement>(root, '[data-el=vis-overlay]'),
    ovTitle: q<HTMLElement>(root, '[data-el=ov-title]'),
    ovSub: q<HTMLElement>(root, '[data-el=ov-sub]'),
    empty: q<HTMLElement>(root, '[data-el=empty]'),
    modeSelect: q<HTMLSelectElement>(root, '[data-el=mode-select]'),
    presetName: q<HTMLElement>(root, '[data-el=preset-name]'),
    fps: q<HTMLElement>(root, '[data-el=fps]'),
    playlist: q<HTMLElement>(root, '[data-el=playlist]'),
    list: q<HTMLUListElement>(root, '[data-el=list]'),
    count: q<HTMLElement>(root, '[data-el=count]'),
    footLeft: q<HTMLElement>(root, '[data-el=foot-left]'),
    footRight: q<HTMLElement>(root, '[data-el=foot-right]'),
    cover: q<HTMLElement>(root, '[data-el=cover]'),
    npTitle: q<HTMLElement>(root, '[data-el=np-title]'),
    npArtist: q<HTMLElement>(root, '[data-el=np-artist]'),
    play: q<HTMLButtonElement>(root, '[data-el=play]'),
    time: q<HTMLElement>(root, '[data-el=time]'),
    duration: q<HTMLElement>(root, '[data-el=duration]'),
    seek: q<HTMLInputElement>(root, '[data-el=seek]'),
    volume: q<HTMLInputElement>(root, '[data-el=volume]'),
    drop: q<HTMLElement>(root, '[data-el=drop]'),
    help: q<HTMLElement>(root, '[data-el=help]'),
    fileInput: q<HTMLInputElement>(root, '[data-el=file-input]'),
    dirInput: q<HTMLInputElement>(root, '[data-el=dir-input]'),
  };
  const btn = (act: string) => root.querySelectorAll<HTMLButtonElement>(`[data-act=${act}]`);

  // ---- visualizer host -------------------------------------------------
  const host = new VisHost(el.vis, engine);
  host.registerAll(modes);
  host.setFpsElement(settings.showFps ? el.fps : null);
  host.lockPreset = settings.lockPreset;
  for (const m of modes) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    opt.title = m.description;
    el.modeSelect.appendChild(opt);
  }
  el.modeSelect.addEventListener('change', () => void host.setModeById(el.modeSelect.value));
  host.addEventListener('mode', () => {
    const m = host.mode;
    if (!m) return;
    el.modeSelect.value = m.id;
    settings.modeId = m.id;
    save();
    host.toast(m.name);
    updatePresetBar();
  });
  host.addEventListener('preset', updatePresetBar);
  host.addEventListener('fullscreen', () => {
    btn('fullscreen').forEach((b) => (b.innerHTML = host.isFullscreen ? icons.exitFullscreen : icons.fullscreen));
  });
  function updatePresetBar() {
    const inst = host.current;
    const has = !!inst?.presetCount;
    const n = has ? inst!.presetCount!() : 0;
    const name = has ? inst!.presetName?.() ?? '' : '';
    el.presetName.textContent = n ? `${name}` : '';
    el.presetName.title = n ? `${name} (${(inst!.currentPreset?.() ?? 0) + 1}/${n})` : '';
    for (const a of ['prev-preset', 'next-preset', 'random-preset']) btn(a).forEach((b) => (b.disabled = !n));
    btn('lock-preset').forEach((b) => {
      b.innerHTML = host.lockPreset ? icons.lock : icons.unlock;
      b.classList.toggle('active', host.lockPreset);
      b.title = host.lockPreset ? 'Unlock preset cycling (L)' : 'Lock preset (L)';
    });
  }
  // periodic refresh (MilkDrop loads packs in the background)
  setInterval(updatePresetBar, 1500);

  // fullscreen cursor / overlay auto-hide
  let cursorTimer = 0;
  el.vis.addEventListener('mousemove', () => {
    el.vis.classList.add('show-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = window.setTimeout(() => el.vis.classList.remove('show-cursor'), 2500);
  });
  el.vis.addEventListener('dblclick', () => host.toggleFullscreen());

  // ---- playlist --------------------------------------------------------
  function renderPlaylist() {
    const tracks = playlist.tracks;
    el.count.textContent = tracks.length ? `(${tracks.length})` : '';
    el.empty.classList.toggle('hidden', tracks.length > 0);
    if (!tracks.length) {
      el.list.innerHTML = `<li class="playlist-empty">Empty. Drop files or folders anywhere, or use the buttons above.</li>`;
      el.footLeft.textContent = '';
      el.footRight.textContent = '';
      return;
    }
    const frag = document.createDocumentFragment();
    let total = 0;
    tracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'playlist-item' + (i === playlist.index ? ' current' : '');
      li.dataset.index = String(i);
      li.innerHTML = `<span class="num">${i + 1}</span><span class="meta"><span class="t"></span><span class="a"></span></span><span class="dur"></span><button class="icon-btn rm" title="Remove">${icons.close}</button>`;
      q<HTMLElement>(li, '.t').textContent = t.title;
      q<HTMLElement>(li, '.a').textContent = [t.artist, t.album].filter(Boolean).join(' — ');
      q<HTMLElement>(li, '.dur').textContent = t.duration ? fmtTime(t.duration) : '';
      total += t.duration ?? 0;
      frag.appendChild(li);
    });
    el.list.replaceChildren(frag);
    el.footLeft.textContent = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`;
    el.footRight.textContent = total ? fmtTime(total) : '';
    el.list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }
  el.list.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const li = target.closest<HTMLElement>('.playlist-item');
    if (!li) return;
    const idx = Number(li.dataset.index);
    if (target.closest('.rm')) {
      playlist.remove(idx);
      return;
    }
    playTrack(playlist.setCurrent(idx));
  });
  playlist.addEventListener('change', renderPlaylist);
  playlist.addEventListener('current', renderPlaylist);
  playlist.addEventListener('mode', () => {
    btn('shuffle').forEach((b) => b.classList.toggle('active', playlist.shuffle));
    btn('repeat').forEach((b) => {
      b.classList.toggle('active', playlist.repeat !== 'off');
      b.innerHTML = playlist.repeat === 'one' ? icons.repeatOne : icons.repeat;
    });
    settings.shuffle = playlist.shuffle;
    settings.repeat = playlist.repeat;
    save();
  });

  function playTrack(t: Track | null) {
    if (!t) return;
    engine.load(t, true);
  }
  function addTracks(tracks: Track[], autoplay = true) {
    if (!tracks.length) return;
    const wasEmpty = playlist.length === 0 || !engine.track;
    playlist.add(tracks);
    if (wasEmpty && autoplay) playTrack(playlist.setCurrent(playlist.tracks.indexOf(tracks[0]!)));
    void readTags(tracks, (t) => {
      renderPlaylist();
      if (engine.track === t) updateNowPlaying();
    });
  }

  // ---- transport ---------------------------------------------------------
  let seeking = false;
  function updateNowPlaying() {
    const t = engine.track;
    el.npTitle.textContent = t ? t.title : 'Nothing playing';
    el.npArtist.textContent = t ? [t.artist, t.album].filter(Boolean).join(' — ') || t.fileName : 'Open some music to begin';
    el.ovTitle.textContent = t ? t.title : '';
    el.ovSub.textContent = t ? t.artist : '';
    if (t?.coverUrl) {
      el.cover.style.backgroundImage = `url("${t.coverUrl}")`;
      el.cover.innerHTML = '';
    } else {
      el.cover.style.backgroundImage = '';
      el.cover.innerHTML = icons.note;
    }
    document.title = t ? `${t.artist ? t.artist + ' – ' : ''}${t.title} · Lumina` : 'Lumina — music player & visualizer';
    updateMediaSession();
  }
  function updatePlayState() {
    el.play.innerHTML = engine.playing ? icons.pause : icons.play;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = engine.playing ? 'playing' : 'paused';
  }
  function updateTime() {
    const cur = engine.currentTime;
    const dur = engine.duration;
    el.time.textContent = fmtTime(cur);
    el.duration.textContent = fmtTime(dur);
    if (!seeking) {
      const v = dur ? Math.round((cur / dur) * 1000) : 0;
      el.seek.value = String(v);
      el.seek.style.setProperty('--fill', `${v / 10}%`);
    }
  }
  el.seek.addEventListener('pointerdown', () => (seeking = true));
  el.seek.addEventListener('input', () => {
    el.seek.style.setProperty('--fill', `${Number(el.seek.value) / 10}%`);
    el.time.textContent = fmtTime((Number(el.seek.value) / 1000) * engine.duration);
  });
  el.seek.addEventListener('change', () => {
    engine.seek((Number(el.seek.value) / 1000) * engine.duration);
    seeking = false;
  });
  el.seek.addEventListener('pointerup', () => (seeking = false));
  const applyVolumeUI = () => {
    el.volume.value = String(Math.round(engine.volume * 100));
    el.volume.style.setProperty('--fill', `${engine.muted ? 0 : engine.volume * 100}%`);
    btn('mute').forEach((b) => (b.innerHTML = engine.muted ? icons.mute : icons.volume));
    settings.volume = engine.volume;
    settings.muted = engine.muted;
    save();
  };
  el.volume.addEventListener('input', () => {
    engine.setMuted(false);
    engine.setVolume(Number(el.volume.value) / 100);
  });
  engine.addEventListener('volumechange', applyVolumeUI);
  engine.addEventListener('play', updatePlayState);
  engine.addEventListener('pause', updatePlayState);
  engine.addEventListener('timeupdate', updateTime);
  engine.addEventListener('durationchange', () => {
    const t = engine.track;
    if (t && engine.duration && !t.duration) {
      t.duration = engine.duration;
      renderPlaylist();
    }
    updateTime();
  });
  engine.addEventListener('trackchange', () => {
    updateNowPlaying();
    updateTime();
    host.notifyTrack();
    renderPlaylist();
  });
  engine.addEventListener('ended', () => {
    const next = playlist.afterEnd();
    if (next) playTrack(next);
    else {
      engine.stop();
      updatePlayState();
    }
  });
  engine.addEventListener('error', () => {
    const t = engine.track;
    host.toast(`Cannot play ${t?.fileName ?? 'track'}`);
    // skip unplayable files unless it is the only one
    if (playlist.length > 1) {
      const next = playlist.next();
      if (next && next !== t) setTimeout(() => playTrack(next), 300);
    }
  });

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const t = engine.track;
    navigator.mediaSession.metadata = t
      ? new MediaMetadata({
          title: t.title,
          artist: t.artist,
          album: t.album,
          artwork: t.coverUrl ? [{ src: t.coverUrl, sizes: '512x512' }] : [],
        })
      : null;
  }
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* unsupported action */
      }
    };
    set('play', () => void engine.play());
    set('pause', () => engine.pause());
    set('stop', () => engine.stop());
    set('previoustrack', () => playTrack(playlist.prev()));
    set('nexttrack', () => playTrack(playlist.next()));
    set('seekto', (d) => {
      if (d.seekTime != null) engine.seek(d.seekTime);
    });
    set('seekbackward', (d) => engine.seekBy(-(d.seekOffset ?? 10)));
    set('seekforward', (d) => engine.seekBy(d.seekOffset ?? 10));
  }

  // ---- actions -------------------------------------------------------------
  async function openFolder() {
    const picked = await tracksFromDirectoryPicker();
    if (picked === null) el.dirInput.click();
    else addTracks(picked);
  }
  async function loadDemo() {
    host.toast('Synthesising demo…');
    const tracks = await demoTracks();
    addTracks(tracks);
  }
  const actions: Record<string, () => void> = {
    'prev-mode': () => void host.prevMode(),
    'next-mode': () => void host.nextMode(),
    'prev-preset': () => host.prevPreset(),
    'next-preset': () => host.nextPreset(),
    'random-preset': () => host.randomPreset(),
    'lock-preset': () => {
      host.setLock(!host.lockPreset);
      settings.lockPreset = host.lockPreset;
      save();
      host.toast(host.lockPreset ? 'Preset locked' : 'Preset cycling on');
    },
    'toggle-playlist': () => {
      el.playlist.hidden = !el.playlist.hidden;
      settings.playlistOpen = !el.playlist.hidden;
      save();
      btn('toggle-playlist').forEach((b) => b.classList.toggle('active', !el.playlist.hidden));
    },
    fullscreen: () => host.toggleFullscreen(),
    help: () => el.help.classList.toggle('hidden'),
    'open-files': () => el.fileInput.click(),
    'open-folder': () => void openFolder(),
    demo: () => void loadDemo(),
    clear: () => {
      engine.stop();
      playlist.clear();
      engine.load({ id: '', title: '', artist: '', album: '', tagged: true, fileName: '', size: 0, url: '' }, false);
      (engine as unknown as { _track: Track | null })._track = null;
      updateNowPlaying();
      updateTime();
    },
    shuffle: () => playlist.toggleShuffle(),
    repeat: () => playlist.cycleRepeat(),
    prev: () => {
      if (engine.currentTime > 3) engine.seek(0);
      else playTrack(playlist.prev());
    },
    next: () => playTrack(playlist.next()),
    toggle: () => {
      if (!engine.track && playlist.length) playTrack(playlist.setCurrent(0));
      else engine.toggle();
    },
    mute: () => engine.toggleMute(),
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    const act = b.dataset.act!;
    actions[act]?.();
  });
  el.help.addEventListener('click', (e) => {
    if (e.target === el.help) el.help.classList.add('hidden');
  });
  el.fileInput.addEventListener('change', () => {
    if (el.fileInput.files) addTracks(tracksFromFileList(el.fileInput.files));
    el.fileInput.value = '';
  });
  el.dirInput.addEventListener('change', () => {
    if (el.dirInput.files) addTracks(tracksFromFileList(el.dirInput.files));
    el.dirInput.value = '';
  });

  // drag & drop anywhere
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragDepth++;
    el.drop.classList.remove('hidden');
  });
  window.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) el.drop.classList.add('hidden');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    el.drop.classList.add('hidden');
    if (!e.dataTransfer) return;
    void tracksFromDataTransfer(e.dataTransfer).then((tracks) => {
      if (tracks.length) addTracks(tracks);
      else host.toast('No audio files found');
    });
  });

  // ---- keyboard ----------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') target.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      el.help.classList.add('hidden');
      return;
    }
    if (host.handleKey(e)) {
      e.preventDefault();
      return;
    }
    const k = e.key;
    const lower = k.toLowerCase();
    let handled = true;
    if (k === ' ') actions.toggle!();
    else if (k === 'ArrowLeft') engine.seekBy(e.shiftKey ? -30 : -5);
    else if (k === 'ArrowRight') engine.seekBy(e.shiftKey ? 30 : 5);
    else if (k === 'ArrowUp') engine.setVolume(engine.volume + 0.05);
    else if (k === 'ArrowDown') engine.setVolume(engine.volume - 0.05);
    else if (lower === 'z') actions.prev!();
    else if (lower === 'x') {
      if (!engine.track && playlist.length) playTrack(playlist.setCurrent(0));
      else void engine.play();
    } else if (lower === 'c') engine.pause();
    else if (lower === 'v') {
      engine.stop();
      updatePlayState();
    } else if (lower === 'b' || lower === 'n') actions.next!();
    else if (lower === 'p') actions.prev!();
    else if (lower === 'm') void (e.shiftKey ? host.prevMode() : host.nextMode());
    else if (/^[0-9]$/.test(k)) {
      const idx = k === '0' ? 9 : Number(k) - 1;
      if (idx < modes.length) void host.setMode(idx);
    } else if (k === ']') host.nextPreset();
    else if (k === '[') host.prevPreset();
    else if (lower === 'r') host.randomPreset();
    else if (lower === 'l') actions['lock-preset']!();
    else if (lower === 'f') host.toggleFullscreen();
    else if (lower === 's') playlist.toggleShuffle();
    else if (lower === 'e') playlist.cycleRepeat();
    else if (lower === 'o') {
      if (e.shiftKey) void openFolder();
      else el.fileInput.click();
    } else if (lower === 'd') void loadDemo();
    else if (k === 'Tab') actions['toggle-playlist']!();
    else if (lower === 'h' || k === '?') actions.help!();
    else if (lower === 'i') {
      settings.showFps = !settings.showFps;
      host.setFpsElement(settings.showFps ? el.fps : null);
      if (!settings.showFps) el.fps.textContent = '';
      save();
    } else handled = false;
    if (handled) e.preventDefault();
  });

  // ---- initial state -------------------------------------------------------
  engine.setVolume(settings.volume);
  engine.setMuted(settings.muted);
  applyVolumeUI();
  playlist.setShuffle(settings.shuffle);
  playlist.setRepeat(settings.repeat);
  el.playlist.hidden = !settings.playlistOpen;
  btn('toggle-playlist').forEach((b) => b.classList.toggle('active', !el.playlist.hidden));
  renderPlaylist();
  updateNowPlaying();
  updatePlayState();
  updateTime();
  const startMode = Math.max(
    0,
    modes.findIndex((m) => m.id === settings.modeId),
  );
  void host.setMode(startMode);
  host.start();

  // PWA file handling: files opened with the installed app arrive through launchQueue
  const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: { files?: FileSystemFileHandle[] }) => void): void } }).launchQueue;
  lq?.setConsumer((params) => {
    if (!params.files?.length) return;
    void Promise.all(params.files.map((h) => h.getFile())).then((files) => addTracks(tracksFromFileList(files)));
  });

  // expose for e2e tests / console tinkering
  (window as unknown as { lumina: unknown }).lumina = { engine, playlist, host, addTracks, loadDemo };
  return { host };
}
