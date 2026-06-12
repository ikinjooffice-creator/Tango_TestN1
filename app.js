(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'target1900_listening_cards_v2';
  const OLD_STORAGE_KEY = 'target1900_listening_cards_v1';
  const SETTINGS_KEY = 'target1900_settings_v2';
  const OLD_SETTINGS_KEY = 'target1900_settings_v1';
  const HISTORY_KEY = 'target1900_history_v1';
  const HARD_KEY = 'target1900_hard_flags_v1';

  const el = {
    openSettings: $('openSettings'), settingsPanel: $('settingsPanel'), partSelect: $('partSelect'), sectionSelect: $('sectionSelect'),
    startNo: $('startNo'), endNo: $('endNo'), revealSeconds: $('revealSeconds'), nextSeconds: $('nextSeconds'),
    shuffleMode: $('shuffleMode'), loopMode: $('loopMode'), autoSpeak: $('autoSpeak'), startBtn: $('startBtn'),
    recentDaysBtn: $('recentDaysBtn'), recentDaysOffBtn: $('recentDaysOffBtn'), lastSessionBtn: $('lastSessionBtn'),
    hardModeBtn: $('hardModeBtn'), exportHardBtn: $('exportHardBtn'),
    cardNo: $('cardNo'), cardPart: $('cardPart'), cardSection: $('cardSection'), wordText: $('wordText'), statusText: $('statusText'),
    answerBox: $('answerBox'), meaningText: $('meaningText'), exampleText: $('exampleText'), translationText: $('translationText'),
    deckPosition: $('deckPosition'), timerState: $('timerState'), progressFill: $('progressFill'), controlsPanel: $('controlsPanel'), restartBtn: $('restartBtn'), prevBtn: $('prevBtn'), pauseBtn: $('pauseBtn'), nextBtn: $('nextBtn'),
    hardBtn: $('hardBtn'), instantBtn: $('instantBtn'), countBtn: $('countBtn'),
    editExample: $('editExample'), editTranslation: $('editTranslation'), saveExampleBtn: $('saveExampleBtn'),
    exportBtn: $('exportBtn'), importFile: $('importFile')
  };

  const state = {
    deck: [], index: 0, paused: false, answerVisible: false,
    timer: null, timerKind: null, timerStart: 0, timerRemaining: 0, timerDuration: 0, timerElapsed: 0, timerCallback: null, progressRaf: null,
    holdPaused: false, gesture: null, controlsHideTimer: null, activeStudy: false, deckMode: 'study',
    saved: loadSaved(), history: loadHistory(), hardFlags: loadHardFlags(), currentWord: null
  };

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function loadSaved() {
    const current = loadJson(STORAGE_KEY, null);
    if (current) return normalizeSaved(current);
    const old = loadJson(OLD_STORAGE_KEY, {});
    return normalizeSaved(old);
  }
  function loadHardFlags() {
    const data = loadJson(HARD_KEY, []);
    return uniqueNos(data);
  }
  function persistHardFlags() { saveJson(HARD_KEY, state.hardFlags); }
  function isHard(no) { return state.hardFlags.includes(Number(no)); }
  function toggleHard(no) {
    const n = Number(no);
    if (!Number.isInteger(n) || n < 1 || n > 1900) return;
    if (isHard(n)) state.hardFlags = state.hardFlags.filter(x => x !== n);
    else state.hardFlags.push(n);
    state.hardFlags = uniqueNos(state.hardFlags).sort((a, b) => a - b);
    persistHardFlags();
  }
  function todayKey(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function normalizeHistory(history) {
    const h = history && typeof history === 'object' ? history : {};
    const days = h.days && typeof h.days === 'object' ? h.days : {};
    Object.keys(days).forEach(key => {
      days[key] = uniqueNos(days[key]);
    });
    const reviewQueue = h.reviewQueue && typeof h.reviewQueue === 'object' ? h.reviewQueue : {};
    Object.keys(reviewQueue).forEach(key => {
      reviewQueue[key] = uniqueNos(reviewQueue[key]);
    });
    return {
      days,
      reviewQueue,
      lastStudyDate: typeof h.lastStudyDate === 'string' ? h.lastStudyDate : '',
      lastStudyViewedNo: Number.isInteger(Number(h.lastStudyViewedNo)) ? Number(h.lastStudyViewedNo) : (Number.isInteger(Number(h.lastViewedNo)) ? Number(h.lastViewedNo) : null),
      lastReviewViewedNo: Number.isInteger(Number(h.lastReviewViewedNo)) ? Number(h.lastReviewViewedNo) : null,
      lastHardViewedNo: Number.isInteger(Number(h.lastHardViewedNo)) ? Number(h.lastHardViewedNo) : null,
      lastSession: uniqueNos(h.lastSession || []),
      currentSession: uniqueNos(h.currentSession || [])
    };
  }
  function loadHistory() { return normalizeHistory(loadJson(HISTORY_KEY, {})); }
  function persistHistory() { saveJson(HISTORY_KEY, state.history); }
  function recordLastViewed(no, mode = 'study') {
    const n = Number(no);
    if (!Number.isInteger(n) || n < 1 || n > 1900) return;
    if (mode === 'review') {
      state.history.lastReviewViewedNo = n;
    } else if (mode === 'hard') {
      state.history.lastHardViewedNo = n;
    } else {
      state.history.lastStudyViewedNo = n;
    }
    persistHistory();
  }
  function recentReviewDates() {
    return [todayKey(-1), todayKey(-2)];
  }
  function prepareRecentReviewQueue() {
    const keep = new Set(recentReviewDates());
    Object.keys(state.history.reviewQueue || {}).forEach(key => {
      if (!keep.has(key)) delete state.history.reviewQueue[key];
    });
    recentReviewDates().forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(state.history.reviewQueue, key)) {
        state.history.reviewQueue[key] = uniqueNos(state.history.days[key] || []);
      }
    });
    persistHistory();
  }
  function markReviewViewed(no) {
    const n = Number(no);
    if (!Number.isInteger(n)) return;
    prepareRecentReviewQueue();
    let changed = false;
    recentReviewDates().forEach(key => {
      const before = state.history.reviewQueue[key] || [];
      const after = before.filter(x => x !== n);
      if (after.length !== before.length) {
        state.history.reviewQueue[key] = after;
        changed = true;
      }
    });
    if (changed) persistHistory();
  }
  function uniqueNos(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 1900))];
  }
  function beginStudySession(mode = 'study') {
    if (state.history.currentSession && state.history.currentSession.length) {
      state.history.lastSession = uniqueNos(state.history.currentSession);
    }
    state.history.currentSession = [];
    state.activeStudy = true;
    state.deckMode = mode;
    if (mode === 'study') state.history.lastStudyDate = todayKey(0);
    persistHistory();
  }
  function recordStudyWord(no) {
    if (!state.activeStudy || state.deckMode !== 'study' || !Number.isInteger(Number(no))) return;
    const n = Number(no);
    const key = todayKey(0);
    state.history.lastStudyDate = key;
    if (!state.history.days[key]) state.history.days[key] = [];
    if (!state.history.days[key].includes(n)) state.history.days[key].push(n);
    if (!state.history.currentSession.includes(n)) state.history.currentSession.push(n);
    persistHistory();
  }
  function buildDeckFromNos(nos, { instantOffOnly = false, label = '復習', mode = 'review', useLastSeen = true } = {}) {
    const set = new Set(uniqueNos(nos));
    let list = WORDS.filter(w => set.has(w.no));
    if (instantOffOnly) list = list.filter(w => !getRecord(w.no).instant);
    list.sort((a, b) => a.no - b.no);
    if (el.shuffleMode.checked) list = shuffle(list);
    state.deck = list;
    state.index = 0;
    if (useLastSeen && state.deck.length) {
      let lastNo = 0;
      if (mode === 'hard') lastNo = Number(state.history.lastHardViewedNo || 0);
      else if (mode === 'review') lastNo = Number(state.history.lastReviewViewedNo || 0);
      const pos = state.deck.findIndex(w => w.no === lastNo);
      if (pos >= 0) state.index = pos;
    }
    beginStudySession(mode);
    el.settingsPanel.classList.add('collapsed');
    updateStudyLock();
    state.paused = false;
    el.pauseBtn.textContent = 'Ⅱ';
    if (!state.deck.length) {
      showCurrent({ speak: false, resetTimers: false });
      el.statusText.textContent = `${label}に該当する単語がありません。`;
      return;
    }
    showCurrent();
  }
  function recentTwoDaysNos() {
    prepareRecentReviewQueue();
    return uniqueNos([
      ...(state.history.reviewQueue[todayKey(-1)] || []),
      ...(state.history.reviewQueue[todayKey(-2)] || [])
    ]);
  }
  function lastSessionNos() {
    return uniqueNos((state.history.lastSession && state.history.lastSession.length) ? state.history.lastSession : state.history.currentSession);
  }
  function hardNos() {
    return uniqueNos(state.hardFlags).sort((a, b) => a - b);
  }
  function csvEscape(value) {
    const v = String(value ?? '');
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportHardCsv() {
    const rows = [['No','word','meaning','example','translation']];
    hardNos().forEach(no => {
      const w = WORDS.find(item => item.no === no);
      if (!w) return;
      const rec = getRecord(no);
      rows.push([w.no, w.word, w.meaning, rec.example || w.example || '', rec.translation || w.translation || '']);
    });
    if (rows.length === 1) {
      alert('苦手フラグが付いた単語がありません。');
      return;
    }
    const csv = '\ufeff' + rows.map(row => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'target1900-hard-words.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  function normalizeSaved(saved) {
    const out = saved && typeof saved === 'object' ? saved : {};
    Object.keys(out).forEach(key => {
      const r = out[key] || {};
      r.instant = !!r.instant;
      r.count = clamp(Number(r.count || 1), 1, 3);
      r.example = typeof r.example === 'string' ? r.example : '';
      r.translation = typeof r.translation === 'string' ? r.translation : '';
      out[key] = r;
    });
    return out;
  }
  function getRecord(no) {
    const key = String(no);
    if (!state.saved[key]) state.saved[key] = { instant: false, count: 1, example: '', translation: '' };
    state.saved[key].count = clamp(Number(state.saved[key].count || 1), 1, 3);
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
      saveSettings();
      return;
    }
    const part = el.partSelect.value;
    if (part === 'p1') { el.startNo.value = 1; el.endNo.value = 800; }
    if (part === 'p2') { el.startNo.value = 801; el.endNo.value = 1500; }
    if (part === 'p3') { el.startNo.value = 1501; el.endNo.value = 1900; }
    if (part === 'all') { el.startNo.value = 1; el.endNo.value = 100; }
    saveSettings();
  }

  function partLabel(no) {
    if (no <= 800) return 'Part1 基本';
    if (no <= 1500) return 'Part2 重要';
    return 'Part3 難単語';
  }

  function selectedCounts() {
    const counts = [...document.querySelectorAll('.countFilter:checked')].map(x => Number(x.value));
    return counts.length ? counts : [1, 2, 3];
  }
  function instantFilter() {
    return document.querySelector('input[name="instantFilter"]:checked').value;
  }

  function buildDeck({ useLastSeen = false } = {}) {
    let start = clamp(Number(el.startNo.value || 1), 1, 1900);
    let end = clamp(Number(el.endNo.value || 1900), 1, 1900);
    if (start > end) [start, end] = [end, start];
    const counts = new Set(selectedCounts());
    const inst = instantFilter();
    let list = WORDS.filter(w => w.no >= start && w.no <= end).filter(w => {
      const r = getRecord(w.no);
      if (!counts.has(Number(r.count || 1))) return false;
      if (inst === 'on' && !r.instant) return false;
      if (inst === 'off' && r.instant) return false;
      return true;
    });
    if (el.shuffleMode.checked) list = shuffle(list);
    state.deck = list;
    state.index = 0;
    if (useLastSeen && state.deck.length) {
      const prior = loadJson(SETTINGS_KEY, null) || loadJson(OLD_SETTINGS_KEY, null) || {};
      const lastNo = Number(state.history.lastStudyViewedNo || prior.lastNo || 0);
      const pos = state.deck.findIndex(w => w.no === lastNo);
      if (pos >= 0) state.index = pos;
    }
    saveSettings();
    persist();
  }

  function showCurrent({ speak = true, resetTimers = true } = {}) {
    clearTimer();
    if (!state.deck.length) {
      state.currentWord = null;
      el.cardNo.textContent = 'No. -';
      el.cardPart.textContent = 'Part -';
      el.cardSection.textContent = 'Section -';
      el.wordText.textContent = 'No cards';
      el.statusText.textContent = '条件に合う単語がありません。範囲や絞り込みを変更してください。';
      clearAnswerText();
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
    el.statusText.textContent = statusLabel(rec);
    clearAnswerText();
    el.editExample.value = rec.example || w.example;
    el.editTranslation.value = rec.translation || w.translation;
    el.deckPosition.textContent = `${state.index + 1} / ${state.deck.length}`;
    updateStatusButtons();
    if (state.deckMode === 'review') {
      recordLastViewed(w.no, 'review');
      markReviewViewed(w.no);
    } else if (state.deckMode === 'hard') {
      recordLastViewed(w.no, 'hard');
    } else {
      recordLastViewed(w.no, 'study');
      recordStudyWord(w.no);
    }
    saveSettings();
    if (speak && el.autoSpeak.checked) speakWord(w.word);
    if (resetTimers) scheduleReveal();
  }

  function statusLabel(rec) {
    const instant = rec.instant ? '◎ 即答' : '即答OFF';
    return `${instant}　${rec.count || 1}回目`;
  }

  function clearAnswerText() {
    el.meaningText.textContent = '　';
    el.exampleText.textContent = '　';
    el.translationText.textContent = '　';
    [el.meaningText, el.exampleText, el.translationText].forEach(x => x.classList.add('blank'));
  }


  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]));
  }

  function renderMeaning(meaning) {
    const parts = String(meaning || '').split('；');
    const first = parts.shift() || '';
    el.meaningText.innerHTML = `<span class="meaning-main">${escapeHtml(first)}</span>${parts.length ? '<span class="meaning-rest">；' + escapeHtml(parts.join('；')) + '</span>' : ''}`;
  }

  function renderExample(example, word) {
    const safe = escapeHtml(example || '');
    if (!word) { el.exampleText.innerHTML = safe; return; }
    const escapedWord = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${escapedWord})(s|es|ed|ing)?\\b`, 'gi');
    el.exampleText.innerHTML = safe.replace(re, '<span class="example-hit">$&</span>');
  }

  function revealAnswer() {
    if (!state.currentWord) return;
    state.answerVisible = true;
    const w = state.currentWord;
    const rec = getRecord(w.no);
    renderMeaning(w.meaning);
    renderExample(rec.example || w.example, w.word);
    el.translationText.textContent = rec.translation || w.translation;
    [el.meaningText, el.exampleText, el.translationText].forEach(x => x.classList.remove('blank'));
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
      el.timerState.textContent = manual ? '最後' : '完了';
      return;
    }
    state.paused = false;
    el.pauseBtn.textContent = 'Ⅱ';
    showCurrent();
  }

  function goPrev() {
    clearTimer();
    if (!state.deck.length) return;
    if (state.index > 0) state.index -= 1;
    else if (el.loopMode.checked) state.index = state.deck.length - 1;
    state.paused = false;
    el.pauseBtn.textContent = 'Ⅱ';
    showCurrent();
  }

  function restartCurrent() {
    if (!state.currentWord) return;
    state.paused = false;
    el.pauseBtn.textContent = 'Ⅱ';
    showCurrent({ speak: true, resetTimers: true });
  }

  function handlePrevSmart() {
    if (state.prevTapTimer) {
      clearTimeout(state.prevTapTimer);
      state.prevTapTimer = null;
      goPrev();
      return;
    }
    state.prevTapTimer = setTimeout(() => {
      state.prevTapTimer = null;
      restartCurrent();
    }, 280);
  }

  function setProgress(value) {
    if (!el.progressFill) return;
    el.progressFill.style.width = `${clamp(value, 0, 1) * 100}%`;
  }

  function scheduleReveal() {
    const ms = Math.max(0, Number(el.revealSeconds.value || 0) * 1000);
    scheduleTimer('表示待ち', ms, revealAnswer);
  }
  function scheduleNext() {
    const ms = Math.max(0, Number(el.nextSeconds.value || 0) * 1000);
    scheduleTimer('次へ', ms, () => goNext(false));
  }
  function scheduleTimer(kind, ms, cb) {
    clearTimer();
    state.timerKind = kind;
    state.timerRemaining = ms;
    state.timerDuration = ms;
    state.timerElapsed = 0;
    state.timerCallback = cb;
    state.timerStart = performance.now();
    setProgress(0);
    el.timerState.textContent = ms === 0 ? kind : `${kind} ${Math.ceil(ms / 1000)}秒`;
    state.timer = setTimeout(cb, ms);
    startProgressLoop();
  }
  function startProgressLoop() {
    if (state.progressRaf) cancelAnimationFrame(state.progressRaf);
    const tick = () => {
      if (!state.timer) return;
      const elapsed = state.timerElapsed + (performance.now() - state.timerStart);
      const duration = Math.max(1, state.timerDuration || 1);
      const remaining = Math.max(0, state.timerDuration - elapsed);
      state.timerRemaining = remaining;
      setProgress(state.timerDuration <= 0 ? 1 : elapsed / duration);
      if (state.timerKind) el.timerState.textContent = remaining === 0 ? state.timerKind : `${state.timerKind} ${Math.ceil(remaining / 1000)}秒`;
      state.progressRaf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopTimerOnly() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (state.progressRaf) cancelAnimationFrame(state.progressRaf);
    state.progressRaf = null;
  }
  function clearTimer() {
    stopTimerOnly();
    state.timerKind = null;
    state.timerCallback = null;
    state.timerRemaining = 0;
    state.timerDuration = 0;
    state.timerElapsed = 0;
    state.holdPaused = false;
    setProgress(0);
  }
  function pauseCountdown({ user = false } = {}) {
    if (!state.timer) return false;
    const elapsed = performance.now() - state.timerStart;
    state.timerElapsed = Math.min(state.timerDuration, state.timerElapsed + elapsed);
    state.timerRemaining = Math.max(0, state.timerDuration - state.timerElapsed);
    stopTimerOnly();
    if (user) {
      state.paused = true;
      el.pauseBtn.textContent = '▶';
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    } else {
      state.holdPaused = true;
    }
    el.timerState.textContent = `停止 ${Math.ceil(state.timerRemaining / 1000)}秒`;
    return true;
  }
  function resumeCountdown({ user = false } = {}) {
    if (!state.timerKind || !state.timerCallback) return false;
    if (user) {
      state.paused = false;
      el.pauseBtn.textContent = 'Ⅱ';
    }
    state.holdPaused = false;
    state.timerStart = performance.now();
    state.timer = setTimeout(state.timerCallback, state.timerRemaining);
    startProgressLoop();
    return true;
  }
  function pauseOrResume() {
    if (!state.timer && !state.paused) return;
    if (!state.paused) {
      pauseCountdown({ user: true });
    } else {
      resumeCountdown({ user: true });
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
    if (!w) {
      el.hardBtn.className = 'mini-toggle hard-toggle';
      el.instantBtn.className = 'mini-toggle';
      el.countBtn.className = 'mini-toggle';
      el.countBtn.textContent = '①';
      return;
    }
    const rec = getRecord(w.no);
    el.hardBtn.className = isHard(w.no) ? 'mini-toggle hard-toggle on hard-on' : 'mini-toggle hard-toggle';
    el.instantBtn.className = rec.instant ? 'mini-toggle on' : 'mini-toggle';
    el.instantBtn.textContent = '◎';
    const count = clamp(Number(rec.count || 1), 1, 3);
    el.countBtn.className = `mini-toggle count-${count}`;
    el.countBtn.textContent = ['','①','②','③'][count];
  }

  function saveSettings() {
    const settings = {
      part: el.partSelect.value, section: el.sectionSelect.value, start: el.startNo.value, end: el.endNo.value,
      reveal: el.revealSeconds.value, next: el.nextSeconds.value, shuffle: el.shuffleMode.checked,
      loop: el.loopMode.checked, autoSpeak: el.autoSpeak.checked, instant: instantFilter(), counts: selectedCounts(),
      lastNo: state.deckMode === 'study' && state.currentWord ? state.currentWord.no : ((loadJson(SETTINGS_KEY, null) || {}).lastNo || null)
    };
    saveJson(SETTINGS_KEY, settings);
  }
  function restoreSettings() {
    const s = loadJson(SETTINGS_KEY, null) || loadJson(OLD_SETTINGS_KEY, null);
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
    const savedCounts = (s.counts || [1,2]).map(n => clamp(Number(n || 1), 1, 3));
    document.querySelectorAll('.countFilter').forEach(c => { c.checked = savedCounts.includes(Number(c.value)); });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 2, saved: state.saved, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
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
        state.saved = normalizeSaved(data.saved);
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

  function advanceFlow() {
    if (!state.currentWord) return;
    if (!state.answerVisible) revealAnswer();
    else goNext(true);
  }

  function bindAnswerGestures() {
    const box = el.answerBox;
    let g = null;
    const clearLongTimer = () => {
      if (g && g.longTimer) { clearTimeout(g.longTimer); g.longTimer = null; }
    };

    box.addEventListener('contextmenu', (e) => e.preventDefault());

    box.addEventListener('pointerdown', (e) => {
      if (!state.currentWord) return;
      g = {
        id: e.pointerId, startX: e.clientX, startY: e.clientY, startTime: performance.now(),
        swiped: false, longPressed: false, moved: false, longTimer: null
      };
      try { box.setPointerCapture(e.pointerId); } catch {}
      g.longTimer = setTimeout(() => {
        if (!g || g.swiped || g.moved) return;
        g.longPressed = true;
        pauseCountdown({ user: false });
      }, 400);
    });

    box.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id || g.swiped) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        g.moved = true;
        clearLongTimer();
      }
      if (dx > 54 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        g.swiped = true;
        if (state.holdPaused && !state.paused) resumeCountdown({ user: false });
        goPrev();
        try { box.releasePointerCapture(e.pointerId); } catch {}
        e.preventDefault();
      }
    }, { passive: false });

    const finish = (e) => {
      if (!g || e.pointerId !== g.id) return;
      clearLongTimer();
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const duration = performance.now() - g.startTime;
      const wasSwipe = g.swiped;
      const wasLong = g.longPressed || state.holdPaused;
      try { box.releasePointerCapture(e.pointerId); } catch {}
      g = null;
      if (wasSwipe) { e.preventDefault(); return; }
      if (wasLong) {
        if (!state.paused) resumeCountdown({ user: false });
        e.preventDefault();
        return;
      }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && duration < 520) {
        advanceFlow();
        e.preventDefault();
      }
    };

    box.addEventListener('pointerup', finish, { passive: false });
    box.addEventListener('pointercancel', (e) => {
      if (!g || e.pointerId !== g.id) return;
      clearLongTimer();
      if (state.holdPaused && !state.paused) resumeCountdown({ user: false });
      g = null;
    });
  }


  function showControls() {
    if (!el.controlsPanel) return;
    el.controlsPanel.classList.remove('collapsed-controls');
  }
  function hideControls() {
    // 操作ボタンは常に表示するため、何もしない。
  }
  function toggleControls() {
    // 操作ボタンは常に表示するため、何もしない。
  }
  function resetControlsAutoHide() {
    // 操作ボタンは常に表示するため、自動非表示タイマーは使わない。
    if (state.controlsHideTimer) {
      clearTimeout(state.controlsHideTimer);
      state.controlsHideTimer = null;
    }
  }


  function updateStudyLock() {
    const locked = el.settingsPanel.classList.contains('collapsed');
    document.body.classList.toggle('study-lock', locked);
  }

  function bind() {
    el.openSettings.addEventListener('click', () => { el.settingsPanel.classList.toggle('collapsed'); updateStudyLock(); });
    el.partSelect.addEventListener('change', () => { el.sectionSelect.value = 'all'; applyPartOrSectionRange(); });
    el.sectionSelect.addEventListener('change', applyPartOrSectionRange);
    el.startBtn.addEventListener('click', () => { beginStudySession(); buildDeck({ useLastSeen: true }); el.settingsPanel.classList.add('collapsed'); updateStudyLock(); state.paused = false; el.pauseBtn.textContent = 'Ⅱ'; showCurrent(); });
    el.recentDaysBtn.addEventListener('click', () => buildDeckFromNos(recentTwoDaysNos(), { label: '昨日・一昨日の復習', mode: 'review' }));
    el.recentDaysOffBtn.addEventListener('click', () => buildDeckFromNos(recentTwoDaysNos(), { instantOffOnly: true, label: '昨日・一昨日の即答OFF復習', mode: 'review' }));
    el.lastSessionBtn.addEventListener('click', () => buildDeckFromNos(lastSessionNos(), { label: '前回の復習', mode: 'review' }));
    el.hardModeBtn.addEventListener('click', () => buildDeckFromNos(hardNos(), { label: '苦手モード', mode: 'hard' }));
    el.exportHardBtn.addEventListener('click', exportHardCsv);
    el.restartBtn.addEventListener('click', () => { restartCurrent(); resetControlsAutoHide(); });
    el.prevBtn.addEventListener('click', () => { goPrev(); resetControlsAutoHide(); });
    el.nextBtn.addEventListener('click', () => { goNext(true); resetControlsAutoHide(); });
    el.pauseBtn.addEventListener('click', () => { pauseOrResume(); resetControlsAutoHide(); });
    bindAnswerGestures();
    el.hardBtn.addEventListener('click', () => {
      if (!state.currentWord) return;
      toggleHard(state.currentWord.no);
      updateStatusButtons();
    });
    el.instantBtn.addEventListener('click', () => {
      if (!state.currentWord) return;
      const rec = getRecord(state.currentWord.no);
      rec.instant = !rec.instant;
      persist(); updateStatusButtons();
      el.statusText.textContent = statusLabel(rec);
    });
    el.countBtn.addEventListener('click', () => {
      if (!state.currentWord) return;
      const rec = getRecord(state.currentWord.no);
      rec.count = rec.count >= 3 ? 1 : rec.count + 1;
      persist(); updateStatusButtons();
      el.statusText.textContent = statusLabel(rec);
    });
    el.saveExampleBtn.addEventListener('click', () => {
      if (!state.currentWord) return;
      const rec = getRecord(state.currentWord.no);
      rec.example = el.editExample.value.trim();
      rec.translation = el.editTranslation.value.trim();
      persist();
      revealAnswer();
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
  buildDeck({ useLastSeen: true });
  if (state.deck.length) {
    showCurrent({ speak: false, resetTimers: false });
    el.timerState.textContent = '再開待ち';
  } else {
    persist();
  }
  updateStudyLock();
})();
