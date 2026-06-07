(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'target1900_listening_cards_v1';
  const SETTINGS_KEY = 'target1900_settings_v1';

  const el = {
    openSettings: $('openSettings'), settingsPanel: $('settingsPanel'), partSelect: $('partSelect'), sectionSelect: $('sectionSelect'),
    startNo: $('startNo'), endNo: $('endNo'), revealSeconds: $('revealSeconds'), nextSeconds: $('nextSeconds'),
    shuffleMode: $('shuffleMode'), loopMode: $('loopMode'), autoSpeak: $('autoSpeak'), startBtn: $('startBtn'),
    cardNo: $('cardNo'), cardPart: $('cardPart'), cardSection: $('cardSection'), wordText: $('wordText'), statusText: $('statusText'),
    answerBox: $('answerBox'), meaningText: $('meaningText'), exampleText: $('exampleText'), translationText: $('translationText'),
    deckPosition: $('deckPosition'), timerState: $('timerState'), prevBtn: $('prevBtn'), pauseBtn: $('pauseBtn'), nextBtn: $('nextBtn'),
    replayBtn: $('replayBtn'), showBtn: $('showBtn'), instantBtn: $('instantBtn'), countButtons: $('countButtons'),
    editExample: $('editExample'), editTranslation: $('editTranslation'), saveExampleBtn: $('saveExampleBtn'),
    exportBtn: $('exportBtn'), importFile: $('importFile')
  };

  const state = {
    deck: [], index: 0, paused: false, answerVisible: false,
    timer: null, timerKind: null, timerStart: 0, timerRemaining: 0,
    saved: loadJson(STORAGE_KEY, {}), currentWord: null
  };

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function getRecord(no) {
    const key = String(no);
    if (!state.saved[key]) state.saved[key] = { instant: false, count: 0, example: '', translation: '' };
    return state.saved[key];
  }
  function persist() { saveJson(STORAGE_KEY, state.saved); }

  function initSections() {
    for (let i = 1; i <= 19; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      const start = (i - 1) * 100 + 1;
      const end = i === 19 ? 1900 : i * 100;
      opt.textContent = `Section${i} ${start}–${end}`;
      el.sectionSelect.appendChild(opt);
    }
  }

  function applyPartOrSectionRange() {
    const section = el.sectionSelect.value;
    if (section !== 'all') {
      const s = Number(section);
      el.startNo.value = (s - 1) * 100 + 1;
      el.endNo.value = s === 19 ? 1900 : s * 100;
      return;
    }
    const part = el.partSelect.value;
    if (part === 'p1') { el.startNo.value = 1; el.endNo.value = 800; }
    if (part === 'p2') { el.startNo.value = 801; el.endNo.value = 1500; }
    if (part === 'p3') { el.startNo.value = 1501; el.endNo.value = 1900; }
    if (part === 'all') { el.startNo.value = 1; el.endNo.value = 100; }
  }

  function partLabel(no) {
    if (no <= 800) return 'Part1 基本';
    if (no <= 1500) return 'Part2 重要';
    return 'Part3 難単語';
  }

  function selectedCounts() {
    return [...document.querySelectorAll('.countFilter:checked')].map(x => Number(x.value));
  }
  function instantFilter() {
    return document.querySelector('input[name="instantFilter"]:checked').value;
  }

  function buildDeck() {
    let start = clamp(Number(el.startNo.value || 1), 1, 1900);
    let end = clamp(Number(el.endNo.value || 1900), 1, 1900);
    if (start > end) [start, end] = [end, start];
    const counts = new Set(selectedCounts());
    const inst = instantFilter();
    let list = WORDS.filter(w => w.no >= start && w.no <= end).filter(w => {
      const r = getRecord(w.no);
      if (!counts.has(Number(r.count || 0))) return false;
      if (inst === 'on' && !r.instant) return false;
      if (inst === 'off' && r.instant) return false;
      return true;
    });
    if (el.shuffleMode.checked) list = shuffle(list);
    state.deck = list;
    state.index = 0;
    saveSettings();
  }

  function showCurrent({ speak = true, resetTimers = true } = {}) {
    clearTimer();
    if (!state.deck.length) {
      state.currentWord = null;
      el.wordText.textContent = 'No cards';
      el.statusText.textContent = '条件に合う単語がありません。範囲や絞り込みを変更してください。';
      el.answerBox.classList.add('hidden');
      el.deckPosition.textContent = '0 / 0';
      el.timerState.textContent = '停止中';
      updateStatusButtons();
      return;
    }
    state.currentWord = state.deck[state.index];
    state.answerVisible = false;
    const w = state.currentWord;
    const rec = getRecord(w.no);
    el.cardNo.textContent = `No. ${w.no}`;
    el.cardPart.textContent = partLabel(w.no);
    el.cardSection.textContent = `Section ${w.section}`;
    el.wordText.textContent = w.word;
    el.statusText.textContent = rec.instant ? '◎ 即答' : `連続正解 ${rec.count || 0}回`;
    el.meaningText.textContent = w.meaning;
    el.exampleText.textContent = rec.example || w.example;
    el.translationText.textContent = rec.translation || w.translation;
    el.editExample.value = rec.example || w.example;
    el.editTranslation.value = rec.translation || w.translation;
    el.answerBox.classList.add('hidden');
    el.deckPosition.textContent = `${state.index + 1} / ${state.deck.length}`;
    updateStatusButtons();
    if (speak && el.autoSpeak.checked) speakWord(w.word);
    if (resetTimers) scheduleReveal();
  }

  function revealAnswer() {
    if (!state.currentWord) return;
    state.answerVisible = true;
    el.answerBox.classList.remove('hidden');
    scheduleNext();
  }

  function goNext(manual = false) {
    clearTimer();
    if (!state.deck.length) return;
    if (state.index < state.deck.length - 1) {
      state.index += 1;
    } else if (el.loopMode.checked) {
      state.index = 0;
    } else {
      el.timerState.textContent = manual ? '最後の単語です' : '完了';
      return;
    }
    state.paused = false;
    el.pauseBtn.textContent = '停止';
    showCurrent();
  }

  function goPrev() {
    clearTimer();
    if (!state.deck.length) return;
    if (state.index > 0) state.index -= 1;
    else if (el.loopMode.checked) state.index = state.deck.length - 1;
    state.paused = false;
    el.pauseBtn.textContent = '停止';
    showCurrent();
  }

  function scheduleReveal() {
    const ms = Math.max(0, Number(el.revealSeconds.value || 0) * 1000);
    scheduleTimer('意味表示待ち', ms, revealAnswer);
  }
  function scheduleNext() {
    const ms = Math.max(0, Number(el.nextSeconds.value || 0) * 1000);
    scheduleTimer('次へ移動待ち', ms, () => goNext(false));
  }
  function scheduleTimer(kind, ms, cb) {
    clearTimer();
    state.timerKind = kind;
    state.timerRemaining = ms;
    state.timerStart = Date.now();
    el.timerState.textContent = ms === 0 ? kind : `${kind} ${Math.round(ms / 1000)}秒`;
    state.timer = setTimeout(cb, ms);
  }
  function clearTimer() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.timerKind = null;
  }
  function pauseOrResume() {
    if (!state.timer && !state.paused) return;
    if (!state.paused) {
      const elapsed = Date.now() - state.timerStart;
      state.timerRemaining = Math.max(0, state.timerRemaining - elapsed);
      clearTimer();
      state.paused = true;
      el.pauseBtn.textContent = '再開';
      el.timerState.textContent = `停止中 残り${Math.ceil(state.timerRemaining / 1000)}秒`;
      speechSynthesis.cancel();
    } else {
      state.paused = false;
      el.pauseBtn.textContent = '停止';
      const remaining = state.timerRemaining;
      if (!state.answerVisible) scheduleTimer('意味表示待ち', remaining, revealAnswer);
      else scheduleTimer('次へ移動待ち', remaining, () => goNext(false));
    }
  }

  function speakWord(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.92;
    speechSynthesis.speak(u);
  }

  function updateStatusButtons() {
    const w = state.currentWord;
    if (!w) return;
    const rec = getRecord(w.no);
    el.instantBtn.textContent = rec.instant ? '◎ 即答 ON' : '◎ 即答 OFF';
    el.instantBtn.classList.toggle('on', !!rec.instant);
    [...el.countButtons.querySelectorAll('button')].forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.count) === Number(rec.count || 0));
    });
  }

  function saveSettings() {
    const settings = {
      part: el.partSelect.value, section: el.sectionSelect.value, start: el.startNo.value, end: el.endNo.value,
      reveal: el.revealSeconds.value, next: el.nextSeconds.value, shuffle: el.shuffleMode.checked,
      loop: el.loopMode.checked, autoSpeak: el.autoSpeak.checked, instant: instantFilter(), counts: selectedCounts()
    };
    saveJson(SETTINGS_KEY, settings);
  }
  function restoreSettings() {
    const s = loadJson(SETTINGS_KEY, null);
    if (!s) return;
    el.partSelect.value = s.part || 'all';
    el.sectionSelect.value = s.section || 'all';
    el.startNo.value = s.start || 1;
    el.endNo.value = s.end || 100;
    el.revealSeconds.value = s.reveal || 3;
    el.nextSeconds.value = s.next || 4;
    el.shuffleMode.checked = !!s.shuffle;
    el.loopMode.checked = s.loop !== false;
    el.autoSpeak.checked = s.autoSpeak !== false;
    const radio = document.querySelector(`input[name="instantFilter"][value="${s.instant || 'all'}"]`);
    if (radio) radio.checked = true;
    document.querySelectorAll('.countFilter').forEach(c => { c.checked = (s.counts || [0,1,2]).includes(Number(c.value)); });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, saved: state.saved, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'target1900-learning-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.saved || typeof data.saved !== 'object') throw new Error('invalid');
        state.saved = data.saved;
        persist();
        showCurrent({ speak: false });
        alert('学習データを読み込みました。');
      } catch {
        alert('読み込みに失敗しました。JSON形式を確認してください。');
      }
    };
    reader.readAsText(file);
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function bind() {
    el.openSettings.addEventListener('click', () => el.settingsPanel.classList.toggle('collapsed'));
    el.partSelect.addEventListener('change', () => { el.sectionSelect.value = 'all'; applyPartOrSectionRange(); });
    el.sectionSelect.addEventListener('change', applyPartOrSectionRange);
    el.startBtn.addEventListener('click', () => { buildDeck(); el.settingsPanel.classList.add('collapsed'); state.paused = false; el.pauseBtn.textContent = '停止'; showCurrent(); });
    el.prevBtn.addEventListener('click', goPrev);
    el.nextBtn.addEventListener('click', () => goNext(true));
    el.pauseBtn.addEventListener('click', pauseOrResume);
    el.replayBtn.addEventListener('click', () => state.currentWord && speakWord(state.currentWord.word));
    el.showBtn.addEventListener('click', () => { clearTimer(); revealAnswer(); });
    el.instantBtn.addEventListener('click', () => {
      if (!state.currentWord) return;
      const rec = getRecord(state.currentWord.no);
      rec.instant = !rec.instant;
      persist(); updateStatusButtons();
      el.statusText.textContent = rec.instant ? '◎ 即答' : `連続正解 ${rec.count || 0}回`;
    });
    el.countButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-count]');
      if (!btn || !state.currentWord) return;
      const rec = getRecord(state.currentWord.no);
      rec.count = Number(btn.dataset.count);
      persist(); updateStatusButtons();
      el.statusText.textContent = rec.instant ? '◎ 即答' : `連続正解 ${rec.count || 0}回`;
    });
    el.saveExampleBtn.addEventListener('click', () => {
      if (!state.currentWord) return;
      const rec = getRecord(state.currentWord.no);
      rec.example = el.editExample.value.trim();
      rec.translation = el.editTranslation.value.trim();
      persist(); showCurrent({ speak: false, resetTimers: false }); revealAnswer();
    });
    el.exportBtn.addEventListener('click', exportData);
    el.importFile.addEventListener('change', (e) => importData(e.target.files[0]));
    ['startNo','endNo','revealSeconds','nextSeconds'].forEach(id => el[id].addEventListener('change', saveSettings));
    ['shuffleMode','loopMode','autoSpeak'].forEach(id => el[id].addEventListener('change', saveSettings));
    document.querySelectorAll('input[name="instantFilter"], .countFilter').forEach(x => x.addEventListener('change', saveSettings));
  }

  initSections();
  restoreSettings();
  bind();
})();
