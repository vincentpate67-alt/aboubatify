const config = window.PLAYER_CONFIG;

const audio = document.getElementById('audioPlayer');
const currentTitle = document.getElementById('currentTitle');
const currentDescription = document.getElementById('currentDescription');
const currentCover = document.getElementById('currentCover');
const currentPlaylistLabel = document.getElementById('currentPlaylistLabel');
const playlistNav = document.getElementById('playlistNav');
const songList = document.getElementById('songList');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressThumb = document.getElementById('progressThumb');
const currentTimeLabel = document.getElementById('currentTime');
const totalTimeLabel = document.getElementById('totalTime');
const volumeControl = document.getElementById('volumeControl');
const speedControl = document.getElementById('speedControl');
const speedValue = document.getElementById('speedValue');
const playPauseButton = document.getElementById('playPause');
const prevTrackButton = document.getElementById('prevTrack');
const nextTrackButton = document.getElementById('nextTrack');
const shuffleToggle = document.getElementById('toggleShuffle');
const libraryTitle = document.getElementById('libraryTitle');
const toggleThemeButton = document.getElementById('toggleTheme');

const state = {
  songs: [],
  allSongs: [],
  currentPlaylistId: config.defaultPlaylist,
  currentSongIndex: -1,
  currentSongId: null,
  shuffleEnabled: false,
  isPlaying: false,
  themeDark: true,
  shuffleHistory: new Map(),
  pendingSeekPercent: null,
  pendingSeekTime: null,
  isSeeking: false,
  mediaRequestId: 0,
  audioObjectUrl: null
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function updateProgress(current, duration) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrent = safeDuration ? clamp(current, 0, safeDuration) : 0;
  const progressPercent = safeDuration ? (safeCurrent / safeDuration) * 100 : 0;
  progressFill.style.width = `${progressPercent}%`;
  progressThumb.style.left = `${progressPercent}%`;
  currentTimeLabel.textContent = formatTime(safeCurrent);
}

function normalizeHex(hex) {
  const value = String(hex || '#8c7bff').trim();
  const cleaned = value.startsWith('#') ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned : '#8c7bff';
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
}

function mixColors(hexA, hexB, ratio) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const mix = (start, end) => Math.round(start + (end - start) * ratio);
  const r = mix(a.r, b.r);
  const g = mix(a.g, b.g);
  const bChannel = mix(a.b, b.b);
  return `rgb(${r}, ${g}, ${bChannel})`;
}

function normalizeColorArray(themeValue) {
  const source = Array.isArray(themeValue) ? themeValue : [themeValue];
  const colors = source
    .filter(Boolean)
    .map((value) => normalizeHex(value))
    .slice(0, 3);

  if (!colors.length) {
    return ['#8c7bff', '#140d2d', '#070b14'];
  }

  if (colors.length === 1) {
    const base = colors[0];
    return [base, mixColors(base, '#6f7dff', 0.35), mixColors(base, '#070b14', 0.75)];
  }

  if (colors.length === 2) {
    const base = colors[0];
    const second = colors[1];
    return [base, second, mixColors(base, '#070b14', 0.75)];
  }

  return colors;
}

function buildThemePalette(themeValue) {
  const defaultPalette = ['#8c7bff', '#140d2d', '#070b14'];
  const colors = normalizeColorArray(themeValue);
  return colors.length >= 3 ? colors : defaultPalette;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function writeWavHeader(view, length, channels, sampleRate) {
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;

  view.setUint32(0x00, 0x46464952, false);
  view.setUint32(0x04, 36 + length, true);
  view.setUint32(0x08, 0x45564157, false);
  view.setUint32(0x0c, 0x20746d66, false);
  view.setUint32(0x10, 16, true);
  view.setUint16(0x14, 1, true);
  view.setUint16(0x16, channels, true);
  view.setUint32(0x18, sampleRate, true);
  view.setUint32(0x1c, byteRate, true);
  view.setUint16(0x20, blockAlign, true);
  view.setUint16(0x22, 16, true);
  view.setUint32(0x24, 0x61746164, false);
  view.setUint32(0x28, length, true);
}

function createWavDataUrl({ baseFreq = 220, duration = 14, accent = '#8c7bff' }) {
  const sampleRate = 22050;
  const channels = 1;
  const totalSamples = Math.floor(sampleRate * duration);
  const pcmLength = totalSamples * channels * 2;
  const buffer = new ArrayBuffer(44 + pcmLength);
  const dataView = new DataView(buffer);
  writeWavHeader(dataView, pcmLength, channels, sampleRate);

  const waveColor = accent;
  const red = parseInt(waveColor.slice(1, 3), 16) / 255;
  const green = parseInt(waveColor.slice(3, 5), 16) / 255;
  const blue = parseInt(waveColor.slice(5, 7), 16) / 255;

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.35) * Math.min(1, (duration - t) / 0.75);
    const bass = Math.sin(2 * Math.PI * (baseFreq * 0.5) * t) * 0.5;
    const lead = Math.sin(2 * Math.PI * baseFreq * t) * 0.6;
    const shimmer = Math.sin(2 * Math.PI * (baseFreq * 1.9) * t) * 0.18;
    const pulse = Math.sin(2 * Math.PI * 4 * t) * 0.08;
    const sample = (bass + lead + shimmer + pulse) * env * 0.35;
    const clamped = clamp(sample, -1, 1);
    const pcm = Math.round(clamped * 32767);
    dataView.setInt16(44 + i * 2, pcm, true);

    if (i % 17 === 0) {
      const accentFactor = Math.min(1, (red + green + blue) / 3 + 0.2);
      dataView.setInt16(44 + i * 2, Math.round(pcm * (0.3 + accentFactor)), true);
    }
  }

  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function createCoverDataUrl({ title = 'Flux', colors = ['#8c7bff', '#68d5ff', '#ff7f9c'] }) {
  const palette = normalizeColorArray(colors);
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(450, 350, 80, 450, 450, 520);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.55, palette[1]);
  gradient.addColorStop(1, '#0b1020');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 18; i += 1) {
    const x = 90 + (i * 42) % 760;
    const y = 120 + ((i * 90) % 620);
    ctx.beginPath();
    ctx.fillStyle = i % 2 === 0 ? palette[0] : palette[2];
    ctx.arc(x, y, 90 + (i % 5) * 24, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(120, 120, 660, 660, 42);
  ctx.stroke();

  ctx.fillStyle = 'rgba(10, 14, 28, 0.28)';
  ctx.fillRect(180, 180, 540, 540);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = '700 120px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title.slice(0, 10).toUpperCase(), 450, 510);

  return canvas.toDataURL('image/jpeg', 0.9);
}

function hasExplicitAssetPath(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.startsWith('data:');
}

function ensureSongMedia(song) {
  const palette = normalizeColorArray(song.theme || ['#8c7bff', '#68d5ff', '#ff7f9c']);

  if (!hasExplicitAssetPath(song.cover)) {
    console.warn('[Player] cover missing or fallback used', { songId: song.id, title: song.title, cover: song.cover });
    song.cover = createCoverDataUrl({ title: song.title, colors: palette });
  } else {
    console.debug('[Player] cover kept from local asset', { songId: song.id, title: song.title, cover: song.cover });
  }

  if (!hasExplicitAssetPath(song.file)) {
    console.warn('[Player] audio file missing or fallback used', { songId: song.id, title: song.title, file: song.file });
    song.file = createWavDataUrl({ baseFreq: 180 + (song.title.length * 7), duration: 14, accent: palette[0] });
  } else {
    console.debug('[Player] audio file kept from local asset', { songId: song.id, title: song.title, file: song.file });
  }

  return song;
}

function loadSongDurations() {
  state.allSongs.forEach((song) => {
    if (!hasExplicitAssetPath(song.file)) return;

    const metadataAudio = new Audio();
    metadataAudio.preload = 'metadata';
    metadataAudio.addEventListener('loadedmetadata', () => {
      if (!Number.isFinite(metadataAudio.duration)) return;
      song.duration = metadataAudio.duration;
      renderSongList();
    }, { once: true });
    metadataAudio.addEventListener('error', () => {
      console.warn('[Player] duration unavailable', { songId: song.id, file: song.file });
    }, { once: true });
    metadataAudio.src = song.file;
  });
}

function safeCover(song) {
  if (!song) return createCoverDataUrl({ title: 'Flux', colors: ['#8c7bff', '#68d5ff', '#ff7f9c'] });
  ensureSongMedia(song);
  return song.cover;
}

async function loadSongs() {
  try {
    const response = await fetch('./data/songs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('JSON unavailable');
    const data = await response.json();

    if (!Array.isArray(data)) throw new Error('songs.json invalid');

    state.allSongs = data.map((song, index) => {
      const normalized = {
        ...song,
        id: song.id || `song-${index + 1}`,
        playlist: Array.isArray(song.playlist) ? song.playlist : [Number(song.playlist) || 1],
        title: song.title || `Track ${index + 1}`,
        description: song.description || 'Sans description.',
        cover: song.cover || '',
        file: song.file || '',
        theme: Array.isArray(song.theme) ? song.theme : ['#8c7bff', '#68d5ff', '#ff7f9c'],
        enabled: true,
        duration: 0
      };
      return ensureSongMedia(normalized);
    });

    state.songs = state.allSongs.filter((song) => song.playlist.includes(1));
    renderPlaylists();
    renderSongList();
    setPlaylist(config.defaultPlaylist);
    loadSongDurations();
    updateTheme();
  } catch (error) {
    console.error(error);
    currentTitle.textContent = 'Library fallback';
    currentDescription.textContent = config.errorMessages.jsonInvalid;

    state.allSongs = [
      {
        id: 'demo-1',
        title: 'Velvet Echo',
        description: 'Une piste immersive générée localement pour démontrer le lecteur.',
        file: createWavDataUrl({ baseFreq: 220, duration: 14, accent: '#8c7bff' }),
        cover: createCoverDataUrl({ title: 'Velvet Echo', colors: ['#5b7cff', '#9b76ff', '#3ef0ff'] }),
        playlist: [1, 4],
        theme: ['#5b7cff', '#9b76ff', '#3ef0ff'],
        enabled: true,
        duration: 14
      },
      {
        id: 'demo-2',
        title: 'Neon Drift',
        description: 'Ambiance nocturne synthétique avec une progression douce.',
        file: createWavDataUrl({ baseFreq: 260, duration: 14, accent: '#ff7aa2' }),
        cover: createCoverDataUrl({ title: 'Neon Drift', colors: ['#ff7aa2', '#ffb36b', '#7c26ff'] }),
        playlist: [2, 4],
        theme: ['#ff7aa2', '#ffb36b', '#7c26ff'],
        enabled: true,
        duration: 14
      }
    ];
    state.songs = state.allSongs;
    renderPlaylists();
    renderSongList();
    setPlaylist('playlist-1');
  }
}

function getPlaylistEntries() {
  return [
    { id: 'playlist-1', name: 'ABOUBAKAR' },
    { id: 'playlist-2', name: 'OUKOUBOUBA' },
    { id: 'playlist-3', name: 'BOUBAGUEZ' },
    { id: 'all', name: 'ALL STAR' }
  ];
}

function renderPlaylists() {
  const entries = getPlaylistEntries();

  playlistNav.innerHTML = '';

  entries.forEach((playlist) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `playlist-pill ${state.currentPlaylistId === playlist.id ? 'active' : ''}`;
    button.textContent = playlist.name;
    if (state.currentPlaylistId === playlist.id) {
      libraryTitle.textContent = playlist.name;
    }
    button.addEventListener('click', () => setPlaylist(playlist.id));
    playlistNav.appendChild(button);
  });
}

function getCurrentPlaylistSongs() {
  if (state.currentPlaylistId === 'all') return [...state.allSongs];
  const playlistNumber = Number(state.currentPlaylistId.replace('playlist-', ''));
  return state.allSongs.filter((song) => song.playlist.includes(playlistNumber));
}

function setPlaylist(playlistId) {
  state.currentPlaylistId = playlistId;
  const currentSongs = getCurrentPlaylistSongs();
  state.songs = currentSongs;
  renderPlaylists();

  const playlist = getPlaylistEntries().find((entry) => entry.id === playlistId);
  const playlistName = playlist?.name || 'Playlist';
  libraryTitle.textContent = playlistName;
  currentPlaylistLabel.textContent = playlistName;

  if (state.songs.length === 0) {
    currentTitle.textContent = 'Aucune musique';
    currentDescription.textContent = 'Ajoutez des titres dans la playlist sélectionnée.';
    return;
  }

  const activeSong = state.songs.find((song) => song.id === state.currentSongId) || state.songs[0];
  selectSong(activeSong.id, false);
  renderSongList();
}

function toggleSongEnabled(songId) {
  const target = state.allSongs.find((song) => song.id === songId) || state.songs.find((song) => song.id === songId);
  if (!target) return;
  target.enabled = !target.enabled;
  renderSongList();
}

function renderSongList() {
  songList.innerHTML = '';
  songList.classList.toggle('is-scrollable', state.songs.length > 5);

  state.songs.forEach((song) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `song-card ${song.id === state.currentSongId ? 'active' : ''} ${state.currentSongId === song.id && state.isPlaying ? 'playing' : ''}`;
    card.style.setProperty('--song-accent', buildThemePalette(song.theme)[0]);

    const isChecked = song.enabled;

    card.innerHTML = `
      <img src="${safeCover(song)}" alt="${song.title}" />
      <div class="song-content">
        <span class="song-title">${song.title}</span>
        <span class="song-description">${song.description}</span>
      </div>
      <div class="song-meta">
        <span class="song-duration">${formatTime(song.duration || 0)}</span>
        <span class="song-toggle ${isChecked ? 'checked' : 'unchecked'}" aria-label="${isChecked ? 'Musique activée' : 'Musique désactivée'}"></span>
      </div>
    `;

    card.addEventListener('click', (event) => {
      const target = event.target;
      if (target.closest('.song-toggle')) {
        toggleSongEnabled(song.id);
        return;
      }
      selectSong(song.id, true);
    });

    songList.appendChild(card);
  });
}

function getEnabledSongs() {
  return state.songs.filter((song) => song.enabled);
}

function chooseNextSong() {
  if (!state.songs.length) return null;

  const pool = getEnabledSongs();
  if (!pool.length) return state.songs[0];

  if (!state.shuffleEnabled) {
    const currentIndex = state.songs.findIndex((song) => song.id === state.currentSongId);
    const nextIndex = currentIndex + 1 < state.songs.length ? currentIndex + 1 : 0;
    return state.songs[nextIndex];
  }

  const currentId = state.currentSongId;
  const played = state.shuffleHistory.get(state.currentPlaylistId) || new Set();
  const poolIds = new Set(pool.map((song) => song.id));
  played.forEach((songId) => {
    if (!poolIds.has(songId)) played.delete(songId);
  });

  let available = pool.filter((song) => !played.has(song.id));
  if (!available.length) {
    played.clear();
    available = [...pool];
  }

  if (available.length > 1) {
    available = available.filter((song) => song.id !== currentId);
  }
  const choice = available[Math.floor(Math.random() * available.length)] || pool[0];
  played.add(choice.id);
  state.shuffleHistory.set(state.currentPlaylistId, played);
  return choice;
}

function updatePlaybackRate() {
  const rate = Number(speedControl.value);
  audio.playbackRate = rate;
  audio.preservesPitch = false;
  audio.mozPreservesPitch = false;
  audio.webkitPreservesPitch = false;
  speedValue.textContent = `${rate.toFixed(1)}x`;
  document.querySelector('.cover-wrapper').style.setProperty('--rotation-duration', `${60 / rate}s`);
}

function setNowPlayingSong(song) {
  state.currentSongId = song.id;
  const palette = buildThemePalette(song.theme);

  currentTitle.textContent = song.title;
  currentDescription.textContent = song.description;
  currentCover.src = safeCover(song);
  currentCover.alt = song.title;
  const playlist = getPlaylistEntries().find((entry) => entry.id === state.currentPlaylistId);
  currentPlaylistLabel.textContent = playlist?.name || 'Playlist';

  document.documentElement.style.setProperty('--accent', palette[0]);
  document.documentElement.style.setProperty('--accent-2', palette[1] || '#68d5ff');
  document.documentElement.style.setProperty('--bg-1', '#070b14');
  document.documentElement.style.setProperty('--bg-2', '#111827');
  document.documentElement.style.setProperty('--bg-3', '#090d18');
  updateBackgroundTint(palette[0]);

  const coverWrapper = document.querySelector('.cover-wrapper');
  coverWrapper.style.filter = 'saturate(1.15) brightness(1.04)';
  setTimeout(() => {
    coverWrapper.style.filter = '';
  }, 420);
}

function updateBackgroundTint(accent) {
  const baseColor = state.themeDark ? '#000000' : '#ffffff';
  const tintAmount = state.themeDark ? 7 : 8;
  const backgroundTint = `color-mix(in srgb, ${accent} ${tintAmount}%, ${baseColor})`;
  document.documentElement.style.setProperty('--bg-tint', backgroundTint);
  document.documentElement.style.background = backgroundTint;
  document.body.style.background = backgroundTint;
}

async function selectSong(songId, autoplay = true) {
  const song = state.songs.find((entry) => entry.id === songId);
  if (!song) {
    console.error('[Player] song not found in current playlist', { songId, currentPlaylistId: state.currentPlaylistId });
    return;
  }

  ensureSongMedia(song);
  state.currentSongId = song.id;
  state.currentSongIndex = state.songs.findIndex((entry) => entry.id === songId);
  if (state.shuffleEnabled) {
    const played = state.shuffleHistory.get(state.currentPlaylistId) || new Set();
    played.add(song.id);
    state.shuffleHistory.set(state.currentPlaylistId, played);
  }

  console.debug('[Player] loading selected song', {
    songId: song.id,
    title: song.title,
    file: song.file,
    cover: song.cover,
    autoplay
  });

  const mediaRequestId = ++state.mediaRequestId;
  audio.pause();
  state.pendingSeekPercent = null;
  state.pendingSeekTime = null;
  state.isSeeking = false;
  setNowPlayingSong(song);
  renderSongList();

  let audioSource = song.file;
  if (hasExplicitAssetPath(song.file) && !song.file.startsWith('blob:')) {
    try {
      const response = await fetch(song.file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const audioBlob = await response.blob();
      if (mediaRequestId !== state.mediaRequestId) return;
      if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
      state.audioObjectUrl = URL.createObjectURL(audioBlob);
      audioSource = state.audioObjectUrl;
      console.debug('[Player] local audio loaded as blob for reliable seeking', {
        songId: song.id,
        file: song.file
      });
    } catch (error) {
      console.warn('[Player] blob loading failed, using original audio path', {
        songId: song.id,
        file: song.file,
        error: error?.message || error
      });
    }
  }

  if (mediaRequestId !== state.mediaRequestId) return;
  audio.src = audioSource;
  audio.load();
  updatePlaybackRate();

  if (autoplay) {
    audio.play().then(() => {
      if (mediaRequestId !== state.mediaRequestId) return;
      state.isPlaying = true;
      updatePlayButton();
      console.debug('[Player] playback started', { songId: song.id, src: audio.src });
    }).catch((error) => {
      if (mediaRequestId !== state.mediaRequestId) return;
      state.isPlaying = false;
      updatePlayButton();
      console.warn('[Player] autoplay blocked or playback failed', {
        songId: song.id,
        error: error?.message || error
      });
    });
  }
}

function updatePlayButton() {
  const coverWrapper = document.querySelector('.cover-wrapper');
  playPauseButton.textContent = state.isPlaying ? '❚❚' : '▶';
  coverWrapper.classList.toggle('playing', state.isPlaying);
}

function togglePlay() {
  if (!state.currentSongId) {
    const firstAvailable = getEnabledSongs()[0] || state.songs[0];
    if (!firstAvailable) return;
    selectSong(firstAvailable.id, true);
    return;
  }

  if (audio.paused) {
    audio.play().then(() => {
      state.isPlaying = true;
      updatePlayButton();
    }).catch(() => {
      state.isPlaying = false;
      updatePlayButton();
    });
  } else {
    audio.pause();
    state.isPlaying = false;
    updatePlayButton();
  }
}

function handleTrackNavigation(direction) {
  if (!state.songs.length) return;

  const source = state.shuffleEnabled ? getEnabledSongs() : state.songs;
  if (!source.length) return;

  let target;
  const currentIndex = state.songs.findIndex((song) => song.id === state.currentSongId);

  if (direction === 'next') {
    if (state.shuffleEnabled) {
      target = chooseNextSong();
    } else {
      const nextIndex = currentIndex + 1 < state.songs.length ? currentIndex + 1 : 0;
      target = state.songs[nextIndex];
    }
  } else if (state.shuffleEnabled) {
    const enabled = getEnabledSongs();
    const previous = enabled.filter((song) => song.id !== state.currentSongId).at(-1) || enabled[0];
    target = previous || state.songs[0];
  } else {
    const prevIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : state.songs.length - 1;
    target = state.songs[prevIndex];
  }

  if (target) selectSong(target.id, true);
}

function bindAudioEvents() {
  audio.volume = Number(volumeControl.value);
  audio.playbackRate = Number(speedControl.value);

  audio.addEventListener('loadedmetadata', () => {
    totalTimeLabel.textContent = formatTime(audio.duration || 0);
    if (state.pendingSeekPercent !== null && Number.isFinite(audio.duration) && audio.duration > 0) {
      state.isSeeking = true;
      state.pendingSeekTime = audio.duration * state.pendingSeekPercent;
      audio.currentTime = state.pendingSeekTime;
      state.pendingSeekPercent = null;
    }
    if (state.currentSongId) {
      const song = state.songs.find((entry) => entry.id === state.currentSongId);
      if (song) {
        song.duration = audio.duration || song.duration || 0;
      }
    }
    renderSongList();
  });

  audio.addEventListener('timeupdate', () => {
    if (state.isSeeking || state.pendingSeekPercent !== null) return;
    updateProgress(audio.currentTime, audio.duration);
  });

  audio.addEventListener('seeking', () => {
    state.isSeeking = true;
  });

  audio.addEventListener('seeked', () => {
    if (state.pendingSeekTime !== null && Math.abs(audio.currentTime - state.pendingSeekTime) > 0.5) {
      audio.currentTime = state.pendingSeekTime;
      return;
    }
    state.isSeeking = false;
    state.pendingSeekTime = null;
    state.pendingSeekPercent = null;
    updateProgress(audio.currentTime, audio.duration);
  });

  audio.addEventListener('ended', () => {
    handleTrackNavigation('next');
  });

  audio.addEventListener('error', (event) => {
    console.error('[Player] audio load error', {
      src: audio.src,
      error: event?.target?.error,
      currentSongId: state.currentSongId,
      currentPlaylistId: state.currentPlaylistId
    });
    currentDescription.textContent = 'Impossible de lire ce fichier. Vérifiez le nom du fichier ou son accès.';
    state.isPlaying = false;
    updatePlayButton();
  });

  audio.addEventListener('canplay', () => {
    console.debug('[Player] audio can play', {
      src: audio.src,
      duration: audio.duration,
      songId: state.currentSongId
    });
  });
}

function setupControls() {
  playPauseButton.addEventListener('click', togglePlay);
  prevTrackButton.addEventListener('click', () => handleTrackNavigation('prev'));
  nextTrackButton.addEventListener('click', () => handleTrackNavigation('next'));

  shuffleToggle.addEventListener('click', () => {
    state.shuffleEnabled = !state.shuffleEnabled;
    if (state.shuffleEnabled && state.currentSongId) {
      const played = state.shuffleHistory.get(state.currentPlaylistId) || new Set();
      played.add(state.currentSongId);
      state.shuffleHistory.set(state.currentPlaylistId, played);
    }
    shuffleToggle.classList.toggle('active', state.shuffleEnabled);
    shuffleToggle.setAttribute('aria-pressed', String(state.shuffleEnabled));
  });

  volumeControl.addEventListener('input', (event) => {
    audio.volume = Number(event.target.value);
  });

  speedControl.addEventListener('input', () => {
    updatePlaybackRate();
  });

  progressBar.addEventListener('click', (event) => {
    const rect = progressBar.getBoundingClientRect();
    const relative = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const duration = audio.duration;

    if (Number.isFinite(duration) && duration > 0) {
      state.mediaRequestId += 1;
      state.isSeeking = true;
      state.pendingSeekTime = duration * relative;
      updateProgress(state.pendingSeekTime, duration);
      audio.currentTime = state.pendingSeekTime;
      state.pendingSeekPercent = null;
      const seekTime = state.pendingSeekTime;
      const seekRequestId = state.mediaRequestId;
      window.setTimeout(() => {
        if (seekRequestId !== state.mediaRequestId || state.pendingSeekTime !== seekTime) return;
        audio.currentTime = seekTime;
        updateProgress(seekTime, audio.duration);
      }, 0);
    } else {
      state.pendingSeekPercent = relative;
      updateProgress(0, 1);
      progressFill.style.width = `${relative * 100}%`;
      progressThumb.style.left = `${relative * 100}%`;
      console.debug('[Player] seek queued until audio metadata is ready', { relative });
    }
  });

  toggleThemeButton.addEventListener('click', () => {
    state.themeDark = !state.themeDark;
    updateTheme();
  });
}

function updateTheme() {
  document.body.classList.toggle('light-theme', !state.themeDark);
  const currentSong = state.allSongs.find((song) => song.id === state.currentSongId);
  updateBackgroundTint(buildThemePalette(currentSong?.theme || ['#8c7bff'])[0]);
  toggleThemeButton.innerHTML = state.themeDark ? '<span class="theme-icon">☼</span>' : '<span class="theme-icon">☾</span>';
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.isPlaying) {
    audio.play().catch(() => {});
  }
});

bindAudioEvents();
setupControls();
updatePlaybackRate();
updateTheme();
loadSongs();
