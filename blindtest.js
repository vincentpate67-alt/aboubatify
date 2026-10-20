export const STEPS = [0.1, 0.2, 0.5, 1, 2, 3, 5, 10];
const COLORS = ['#ff163d', '#ff4141', '#ff7039', '#ffa631', '#dfca30', '#a4dc3b', '#60e465', '#26e99a'];
const HISTORY_KEY = 'aboubatify-blindtest-history-v1';

export function chooseBlindtestSong(songs, history, previousId, random = Math.random) {
  const lastId = previousId || history.recent?.[0];
  const candidates = songs.length > 1 ? songs.filter(item => item.id !== lastId) : songs;
  if (!candidates.length) return null;
  const weights = candidates.map(item => {
    const count = history.counts?.[item.id];
    const seen = Number.isSafeInteger(count) && count > 0 ? count : 0;
    const recentPenalty = history.recent?.includes(item.id) ? 0.2 : 1;
    return recentPenalty / (1 + seen) ** 2;
  });
  let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < candidates.length; i++) {
    draw -= weights[i];
    if (draw < 0) return candidates[i];
  }
  return candidates.at(-1);
}

export function timelinePosition(seconds) {
  return Math.min(100, Math.max(0, seconds / 10 * 100));
}

export function normalizeAnswer(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]/g, '');
}

export function createBlindtest({ getSongs, getVolume, getCatalog = getSongs }) {
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
    <div class="bt-timeline" role="progressbar" aria-label="Lecture de l’extrait" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0">
      <div class="bt-track"><div class="bt-track-colors"></div><div class="bt-unplayed"></div><div class="bt-cursor"></div></div>
      <div class="bt-markers"></div>
      <div class="bt-timing"><span id="btElapsed">0,0 s</span><span id="btLimit">Extrait · 0,1 s</span></div>
    </div>
    <div class="bt-actions">
      <button class="bt-primary" id="btListen" type="button">Commencer</button>
      <button id="btSkip" type="button" hidden>Je sais pas →</button>
    </div>
    <form id="btForm" hidden autocomplete="off">
      <label for="btAnswer">Quel est le titre ?</label>
      <div class="bt-answer-row"><input id="btAnswer" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="btSuggestions" placeholder="Écris le titre…" maxlength="200" required /><button id="btSubmit" type="submit" disabled>Valider</button></div>
      <ul id="btSuggestions" role="listbox" aria-label="Titres proposés" hidden></ul>
    </form>
    <p id="btStatus" role="status" aria-live="polite">Trouve le titre dès 0,1 s pour gagner 8 points.</p>
    <div id="btReveal" hidden><img alt="Pochette du morceau" /><h3></h3><p></p></div>
    <button id="btNext" type="button" hidden>Morceau suivant →</button>`;
  document.querySelector('.app-shell').append(panel);
  const backdrop = document.createElement('div');
  backdrop.className = 'bt-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  const confetti = document.createElement('div');
  confetti.className = 'bt-confetti';
  confetti.setAttribute('aria-hidden', 'true');
  document.body.prepend(backdrop, confetti);
  const $ = selector => panel.querySelector(selector);
  const listen = $('#btListen'), skip = $('#btSkip'), form = $('#btForm');
  const answer = $('#btAnswer'), status = $('#btStatus'), next = $('#btNext');
  const suggestions = $('#btSuggestions');
  let matches = [], selectedMatch = -1;
  const catalog = () => [...new Set(getCatalog().map(item => item.title))];
  const isKnownTitle = () => catalog().some(title => normalizeAnswer(title) === normalizeAnswer(answer.value));
  function closeSuggestions() {
    suggestions.hidden = true;
    answer.setAttribute('aria-expanded', 'false');
    answer.removeAttribute('aria-activedescendant');
    selectedMatch = -1;
  }
  function chooseTitle(title) {
    answer.value = title;
    $('#btSubmit').disabled = false;
    answer.focus();
    closeSuggestions();
  }
  function updateSuggestions() {
    const query = normalizeAnswer(answer.value);
    $('#btSubmit').disabled = !isKnownTitle() || !query;
    selectedMatch = -1;
    answer.removeAttribute('aria-activedescendant');
    if (!query) { closeSuggestions(); return; }
    matches = catalog().filter(title => normalizeAnswer(title).includes(query))
      .sort((a, b) => Number(normalizeAnswer(b).startsWith(query)) - Number(normalizeAnswer(a).startsWith(query)) || a.localeCompare(b, 'fr'));
    suggestions.replaceChildren(...matches.map((title, index) => {
      const option = document.createElement('li');
      option.id = `bt-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = title;
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => chooseTitle(title));
      return option;
    }));
    if (!matches.length) {
      const empty = document.createElement('li');
      empty.className = 'bt-no-match';
      empty.setAttribute('role', 'presentation');
      empty.textContent = 'Aucun titre correspondant';
      suggestions.append(empty);
    }
    suggestions.hidden = false;
    answer.setAttribute('aria-expanded', 'true');
  }
  answer.addEventListener('input', updateSuggestions);
  answer.addEventListener('focus', () => { if (answer.value) updateSuggestions(); });
  answer.addEventListener('blur', closeSuggestions);
  answer.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeSuggestions(); return; }
    if (event.key === 'Enter' && !suggestions.hidden && selectedMatch >= 0) {
      event.preventDefault();
      chooseTitle(matches[selectedMatch]);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (suggestions.hidden) updateSuggestions();
    if (!matches.length) return;
    selectedMatch = selectedMatch < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
      : (selectedMatch + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
    suggestions.querySelectorAll('[role="option"]').forEach((option, index) => option.setAttribute('aria-selected', String(index === selectedMatch)));
    const active = suggestions.children[selectedMatch];
    answer.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView?.({ block: 'nearest' });
  });
  let context, source, buffer, song, offset = 0, step = 0, request = 0;
  let history = { counts: Object.create(null), recent: [] }, roundRecorded = false;
  try {
    const saved = JSON.parse(window.localStorage.getItem(HISTORY_KEY));
    if (saved && typeof saved.counts === 'object' && saved.counts !== null) {
      for (const [id, count] of Object.entries(saved.counts)) {
        if (Number.isSafeInteger(count) && count >= 0) history.counts[id] = count;
      }
      history.recent = Array.isArray(saved.recent) ? saved.recent.filter(id => typeof id === 'string').slice(0, 4) : [];
    }
  } catch { /* Keep an in-memory history when browser storage is unavailable. */ }
  let visible = false, busy = false, solved = false, heard = false, points = 0, wins = 0;
  let controller, activeGain, frame = 0, playbackRequest = 0, confettiTimer;
  const transitions = new WeakMap();
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const durationLabel = () => `${String(STEPS[step]).replace('.', ',')} s`;
  const timeline = $('.bt-timeline');
  $('.bt-markers').replaceChildren(...STEPS.map((seconds, index) => {
    const mark = document.createElement('span');
    mark.className = 'bt-marker';
    mark.style.left = `${timelinePosition(seconds)}%`;
    mark.style.setProperty('--label-row', index < 3 ? index : 0);
    mark.style.setProperty('--mark-color', COLORS[index]);
    mark.textContent = `${String(seconds).replace('.', ',')}`;
    return mark;
  }));

  function show(element, value) {
    const previous = transitions.get(element);
    if (previous?.value === value || (!previous && element.hidden === !value)) return;
    previous?.animation.cancel();
    if (!element.animate || reducedMotion()) { element.hidden = !value; element.inert = false; transitions.delete(element); return; }
    element.hidden = false;
    element.inert = !value;
    const animation = element.animate(
      value ? [{ opacity: 0, transform: 'translateY(10px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }]
        : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'translateY(-6px) scale(.96)' }],
      { duration: value ? 380 : 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    transitions.set(element, { value, animation });
    animation.onfinish = () => {
      if (transitions.get(element)?.animation !== animation) return;
      element.hidden = !value;
      element.inert = false;
      transitions.delete(element);
    };
  }

  function paint() {
    const songColor = Array.isArray(song?.theme) ? song.theme[0] : song?.theme;
    const color = solved && /^#[0-9a-f]{6}$/i.test(songColor || '') ? songColor : COLORS[step];
    panel.style.setProperty('--accent', color);
    backdrop.style.backgroundColor = color;
    panel.style.setProperty('--bt-color', color);
    backdrop.classList.toggle('active', visible);
    document.body.classList.toggle('bt-active', visible);
  }

  function progress(elapsed, full = false) {
    const limit = full ? Math.max(.1, buffer.duration - offset) : STEPS[step];
    const position = full ? Math.min(100, elapsed / limit * 100) : timelinePosition(elapsed);
    timeline.style.setProperty('--bt-progress', `${position}%`);
    timeline.setAttribute('aria-valuemax', String(limit));
    timeline.setAttribute('aria-valuenow', String(Math.min(elapsed, limit)));
    $('#btElapsed').textContent = `${elapsed.toFixed(1).replace('.', ',')} s`;
  }

  function celebrate() {
    clearTimeout(confettiTimer);
    confetti.replaceChildren();
    if (reducedMotion()) return;
    for (let i = 0; i < 65; i++) {
      const piece = document.createElement('i');
      piece.style.cssText = `left:${Math.random() * 100}%;--drift:${Math.random() * 240 - 120}px;--spin:${Math.random() * 1000 - 500}deg;background:${COLORS[i % COLORS.length]};animation-delay:${Math.random() * .9}s;animation-duration:${3 + Math.random() * 2}s`;
      confetti.append(piece);
    }
    confettiTimer = setTimeout(() => confetti.replaceChildren(), 6500);
  }

  function stop() {
    playbackRequest += 1;
    cancelAnimationFrame(frame);
    panel.classList.remove('bt-playing');
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
    $('.bt-markers').querySelectorAll('.bt-marker').forEach((mark, index) => {
      mark.classList.toggle('current', index === step);
      if (index === step) mark.setAttribute('aria-current', 'step');
      else mark.removeAttribute('aria-current');
    });
    timeline.classList.toggle('bt-full-song', solved);
    $('#btLimit').textContent = solved ? 'Lecture du morceau' : `Extrait · ${durationLabel()}`;
    paint();
    listen.disabled = busy;
    show(listen, !solved);
    listen.textContent = busy ? 'Chargement…' : buffer ? `▶ Réécouter ${durationLabel()}` : '▶ Commencer';
    show(skip, !!buffer && !solved);
    skip.disabled = busy || !heard;
    skip.textContent = step === STEPS.length - 1 ? 'Voir la réponse' : 'Je sais pas →';
    show(form, heard && !solved);
    show(next, solved);
    $('#btScore').textContent = `${points} point${points > 1 ? 's' : ''} · ${wins} trouvé${wins > 1 ? 's' : ''}`;
  }

  async function play(full = false) {
    if (!buffer || !visible || busy) return;
    const token = request;
    stop();
    const playToken = playbackRequest;
    try {
      await context.resume();
      if (token !== request || playToken !== playbackRequest || !visible) return;
      source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      activeGain = gain;
      gain.gain.value = getVolume();
      source.connect(gain);
      gain.connect(context.destination);
      const playing = source;
      const length = full ? buffer.duration - offset : Math.min(STEPS[step], buffer.duration - offset);
      const started = context.currentTime;
      progress(0, full);
      panel.classList.add('bt-playing');
      const tick = () => {
        if (source !== playing) return;
        progress(Math.min(context.currentTime - started, length), full);
        frame = requestAnimationFrame(tick);
      };
      source.onended = () => {
        playing.disconnect();
        gain.disconnect();
        if (source === playing) {
          source = null;
          cancelAnimationFrame(frame);
          progress(length, full);
          panel.classList.remove('bt-playing');
        }
      };
      // The audio clock cuts the sample precisely, even for the 100 ms step.
      if (full) source.start(0, offset);
      else source.start(0, offset, length);
      // Only count a round once it actually plays, never on replay or failed loading.
      if (!roundRecorded) {
        roundRecorded = true;
        history.counts[song.id] = (history.counts[song.id] || 0) + 1;
        history.recent = [song.id, ...history.recent.filter(id => id !== song.id)].slice(0, 4);
        try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
      }
      frame = requestAnimationFrame(tick);
      heard = true;
      render();
    } catch {
      status.textContent = 'Lecture impossible. Réessaie avec un nouveau morceau.';
    }
  }

  async function newRound() {
    stop();
    controller?.abort();
    const token = ++request;
    const previousId = song?.id;
    roundRecorded = false;
    buffer = null;
    solved = false;
    heard = false;
    step = 0;
    confetti.replaceChildren();
    clearTimeout(confettiTimer);
    status.classList.remove('bt-won');
    panel.classList.remove('bt-revealed');
    progress(0);
    answer.value = '';
    $('#btSubmit').disabled = true;
    closeSuggestions();
    show($('#btReveal'), false);
    const selected = chooseBlindtestSong(getSongs(), history, previousId);
    if (!selected) {
      status.textContent = 'Active au moins une musique dans la bibliothèque pour jouer.';
      render();
      return;
    }
    song = selected;
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
    closeSuggestions();
    solved = true;
    stop();
    if (won) { points += STEPS.length - step; wins += 1; }
    status.replaceChildren();
    status.classList.toggle('bt-won', won);
    panel.classList.add('bt-revealed');
    if (won) {
      const title = document.createElement('strong');
      title.textContent = 'Bien joué !';
      const detail = document.createElement('span');
      detail.textContent = `Trouvé à ${durationLabel()} · +${STEPS.length - step} point${STEPS.length - step > 1 ? 's' : ''}`;
      status.append(title, detail);
      celebrate();
    }
    $('#btReveal img').src = song.cover;
    $('#btReveal h3').textContent = song.title;
    $('#btReveal p').textContent = song.description || '';
    show($('#btReveal'), true);
    render();
    if (won) void play(true);
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
    status.textContent = wrong ? 'Pas tout à fait !' : '';
    render();
    void play();
  }

  listen.addEventListener('click', () => buffer ? void play() : void newRound());
  next.addEventListener('click', () => void newRound());
  skip.addEventListener('click', () => { if (!busy && !solved && heard) advance(false); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!heard || solved || busy || !normalizeAnswer(answer.value)) return;
    if (!isKnownTitle()) { updateSuggestions(); return; }
    if (normalizeAnswer(answer.value) === normalizeAnswer(song.title)) reveal(true);
    else { answer.value = ''; $('#btSubmit').disabled = true; closeSuggestions(); advance(true); answer.focus(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !solved) stop(); });
  render();
  return {
    setVisible(value) {
      visible = value;
      show(panel, value);
      paint();
      if (!value) {
        stop();
        confetti.replaceChildren();
        clearTimeout(confettiTimer);
        request += 1;
        controller?.abort();
        busy = false;
        render();
      }
    }
  };
}
