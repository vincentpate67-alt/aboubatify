export const STEPS = [0.1, 0.2, 0.5, 1, 2, 3, 5, 10];

export function normalizeAnswer(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]/g, '');
}

export function createBlindtest({ getSongs, getVolume }) {
  const panel = document.createElement('section');
  panel.className = 'blindtest panel glass-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Blindtest musical');
  panel.innerHTML = `
    <div class="bt-top"><span class="playlist-badge">LE BLINDTEST</span><span id="btScore">0 point · 0 trouvé</span></div>
    <div class="bt-mystery" aria-hidden="true">♪ ?</div>
    <p class="eyebrow">Tu connais vraiment les classiques ?</p>
    <h2>Une fraction de seconde. Un titre.</h2>
    <p class="bt-intro">Un passage au hasard, de plus en plus long. Réécoute autant que tu veux.</p>
    <div class="bt-steps" aria-label="Paliers d'écoute"></div>
    <div class="bt-actions">
      <button class="bt-primary" id="btListen" type="button">Commencer</button>
      <button id="btSkip" type="button" hidden>Je sais pas →</button>
    </div>
    <form id="btForm" hidden autocomplete="off">
      <label for="btAnswer">Quel est le titre ?</label>
      <div class="bt-answer-row"><input id="btAnswer" placeholder="Écris le titre…" maxlength="200" required /><button type="submit">Valider</button></div>
      <small>Majuscules, accents, espaces et ponctuation ne comptent pas.</small>
    </form>
    <p id="btStatus" role="status" aria-live="polite">Trouve le titre dès 0,1 s pour gagner 8 points.</p>
    <div id="btReveal" hidden><img alt="Pochette du morceau" /><h3></h3><p></p></div>
    <button id="btNext" type="button" hidden>Morceau suivant →</button>`;
  document.querySelector('.app-shell').append(panel);
  const $ = selector => panel.querySelector(selector);
  const listen = $('#btListen'), skip = $('#btSkip'), form = $('#btForm');
  const answer = $('#btAnswer'), status = $('#btStatus'), next = $('#btNext');
  let context, source, buffer, song, offset = 0, step = 0, request = 0;
  let visible = false, busy = false, solved = false, heard = false, points = 0, wins = 0;
  let controller, activeGain;
  const durationLabel = () => `${String(STEPS[step]).replace('.', ',')} s`;

  function stop() {
    if (source) {
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect();
      source = null;
    }
    activeGain?.disconnect();
    activeGain = null;
  }

  function render() {
    $('.bt-steps').replaceChildren(...STEPS.map((seconds, index) => {
      const chip = document.createElement('span');
      chip.textContent = `${String(seconds).replace('.', ',')} s`;
      chip.className = index === step ? 'current' : index < step ? 'passed' : '';
      if (index === step) chip.setAttribute('aria-current', 'step');
      return chip;
    }));
    listen.disabled = busy;
    listen.textContent = busy ? 'Chargement…' : buffer ? `▶ Réécouter ${durationLabel()}` : '▶ Commencer';
    skip.hidden = !buffer || solved;
    skip.disabled = busy || !heard;
    skip.textContent = step === STEPS.length - 1 ? 'Voir la réponse' : 'Je sais pas →';
    form.hidden = !heard || solved;
    next.hidden = !solved;
    $('#btScore').textContent = `${points} point${points > 1 ? 's' : ''} · ${wins} trouvé${wins > 1 ? 's' : ''}`;
  }

  async function play() {
    if (!buffer || !visible || busy) return;
    const token = request;
    try {
      await context.resume();
      if (token !== request || !visible) return;
      stop();
      source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      activeGain = gain;
      gain.gain.value = getVolume();
      source.connect(gain);
      gain.connect(context.destination);
      const playing = source;
      source.onended = () => {
        playing.disconnect();
        gain.disconnect();
        if (source === playing) source = null;
      };
      // The audio clock cuts the sample precisely, even for the 100 ms step.
      source.start(0, offset, Math.min(STEPS[step], buffer.duration - offset));
      heard = true;
      render();
    } catch {
      status.textContent = 'Lecture impossible. Appuie sur Réécouter pour réessayer.';
    }
  }

  async function newRound() {
    stop();
    controller?.abort();
    const token = ++request;
    const previousId = song?.id;
    buffer = null;
    solved = false;
    heard = false;
    step = 0;
    answer.value = '';
    $('#btReveal').hidden = true;
    let candidates = getSongs();
    if (candidates.length > 1) candidates = candidates.filter(item => item.id !== previousId);
    if (!candidates.length) {
      status.textContent = 'Active au moins une musique dans la bibliothèque pour jouer.';
      render();
      return;
    }
    song = candidates[Math.floor(Math.random() * candidates.length)];
    busy = true;
    render();
    status.textContent = 'Préparation du morceau mystère…';
    const roundController = new AbortController();
    controller = roundController;
    const timeout = setTimeout(() => roundController.abort(), 45000);
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)();
      await context.resume();
      const response = await fetch(song.file, { signal: roundController.signal });
      if (!response.ok) throw new Error('Audio unavailable');
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
      if (token !== request || !visible) return;
      if (decoded.duration < 10) throw new Error('Audio too short');
      buffer = decoded;
      // Every extension starts at exactly this same randomly selected instant.
      offset = Math.random() * (buffer.duration - 10);
      busy = false;
      status.textContent = 'À toi ! Quel titre se cache derrière cet extrait ?';
      await play();
      answer.focus();
    } catch {
      if (token !== request) return;
      buffer = null;
      status.textContent = 'Ce morceau n’a pas pu être chargé. Appuie sur Commencer pour réessayer.';
    } finally {
      clearTimeout(timeout);
      if (token === request) { busy = false; render(); }
    }
  }

  function reveal(won) {
    solved = true;
    stop();
    if (won) { points += STEPS.length - step; wins += 1; }
    status.textContent = won
      ? `Bien joué ! Trouvé à ${durationLabel()} : +${STEPS.length - step} points.`
      : 'Pas grave, tu connais le titre pour la prochaine fois !';
    $('#btReveal img').src = song.cover;
    $('#btReveal h3').textContent = song.title;
    $('#btReveal p').textContent = song.description || '';
    $('#btReveal').hidden = false;
    render();
    next.focus();
  }

  function advance(wrong) {
    stop();
    if (step === STEPS.length - 1) {
      if (!wrong) reveal(false);
      else status.textContent = 'Pas tout à fait ! Réessaie, réécoute ou affiche la réponse.';
      return;
    }
    step += 1;
    status.textContent = `${wrong ? 'Pas tout à fait !' : 'Un petit indice de plus.'} Le même passage dure maintenant ${durationLabel()}.`;
    render();
    void play();
  }

  listen.addEventListener('click', () => buffer ? void play() : void newRound());
  next.addEventListener('click', () => void newRound());
  skip.addEventListener('click', () => { if (!busy && !solved && heard) advance(false); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!heard || solved || busy || !normalizeAnswer(answer.value)) return;
    if (normalizeAnswer(answer.value) === normalizeAnswer(song.title)) reveal(true);
    else { answer.value = ''; advance(true); answer.focus(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  render();
  return {
    setVisible(value) {
      visible = value;
      panel.hidden = !value;
      if (!value) {
        stop();
        request += 1;
        controller?.abort();
        busy = false;
        render();
      }
    }
  };
}
