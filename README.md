# Flux — lecteur de playlists local immersif

## Technologies utilisées

- HTML5 pour la structure de l’interface
- CSS3 avec gradients, glassmorphism et animations légères
- JavaScript moderne (ES modules compatible navigateur)
- JSON pour la configuration des pistes et la structure des playlists
- Pas de dépendance lourde ni d’installateur Windows requis

## Architecture

Le projet est séparé en composants logiques et visuels :

- `index.html` : structure globale de l’application
- `styles.css` : design, animations, thèmes, responsive
- `config.js` : configuration des 3 playlists + paramètres global
- `app.js` : logique de lecture, navigation, shuffle, interface, données
- `data/songs.json` : métadonnées des pistes
- `music/` : fichiers audio `.mp3` locaux
- `covers/` : images de couverture

## Fichiers de musique

Ajoute tes fichiers dans les dossiers suivants :

```
/music-player/
  /music/
    song1.mp3
    song2.mp3
  /covers/
    song1.jpg
    song2.jpg
  /data/
    songs.json
```

Exemple de structure JSON :

```json
{
  "id": "song-1",
  "title": "Nom de la musique",
  "description": "Description",
  "file": "music/song1.mp3",
  "cover": "covers/song1.jpg",
  "playlist": [1, 4],
  "theme": ["#5b7cff", "#9b76ff", "#3ef0ff"]
}
```

## Démarrage

Ouvre simplement le dossier sur un serveur local, par exemple :

```bash
cd /chemin/vers/music-player
python -m http.server 8000
```

Puis ouvre :

`http://localhost:8000`

## Points forts

- 3 playlists principales + collection complète
- sélection de musiques activables/désactivables
- shuffle cohérent avec prise en compte des pistes désactivées
- lecture, pause, suivant/précédent, vitesse, volume
- thème sombre/clair
- animations cinématiques de fond et de couverture
- interface responsive

## Remarque

Le lecteur est conçu pour fonctionner avec des fichiers locaux et reste compatible avec l’hébergement statique GitHub Pages / GitHub. Si tu ajoutes des MP3 réels, le système les chargera automatiquement à partir de `songs.json`.
