import './styles/app.css';
import { AudioEngine } from './audio/engine';
import { Playlist } from './library/playlist';
import { createApp } from './ui/app';
import { modes } from './vis/registry';

const engine = new AudioEngine();
const playlist = new Playlist();
createApp(document.getElementById('app')!, { engine, playlist, modes });
