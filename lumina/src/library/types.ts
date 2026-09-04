export interface Track {
  id: string;
  /** local file (object URL is created by the engine on load) */
  file?: File;
  /** remote or demo URL */
  url?: string;
  title: string;
  artist: string;
  album: string;
  year?: number;
  trackNo?: number;
  duration?: number;
  /** object URL of embedded cover art */
  coverUrl?: string;
  /** whether tags were read */
  tagged: boolean;
  fileName: string;
  size: number;
}

export type RepeatMode = 'off' | 'all' | 'one';

export const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'flac',
  'wav',
  'ogg',
  'oga',
  'opus',
  'webm',
  'weba',
  'mp4',
  'aif',
  'aiff',
]);

export function isAudioFile(name: string, type?: string): boolean {
  if (type && type.startsWith('audio/')) return true;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTENSIONS.has(ext);
}
