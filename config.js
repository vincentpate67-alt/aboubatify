window.PLAYER_CONFIG = {
  playlists: {
    "playlist-1": { id: "playlist-1", name: "Playlist 01" },
    "playlist-2": { id: "playlist-2", name: "Playlist 02" },
    "playlist-3": { id: "playlist-3", name: "Playlist 03" },
    all: { id: "all", name: "Collection complète" }
  },
  defaultPlaylist: "playlist-1",
  defaultVolume: 0.75,
  defaultPlaybackRate: 1,
  theme: {
    dark: true,
    accent: "#8c7bff"
  },
  errorMessages: {
    songMissing: "Fichier audio introuvable.",
    coverMissing: "Cover absente.",
    jsonInvalid: "Le fichier de données est invalide.",
    songError: "Cette musique n'a pas pu être chargée."
  }
};
