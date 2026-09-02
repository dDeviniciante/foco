const { addFocusedSeconds, normalizeTaskKey, totalsForDisplay } = (() => {
  function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function yesterdayKey(date) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() - 1);
    return dayKey(copy);
  }
  return {
    normalizeTaskKey(task) {
      return String(task || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    },
    addFocusedSeconds(state, seconds, at) {
      const key = dayKey(at);
      state.totals[key] = (Number(state.totals[key]) || 0) + Math.max(0, Math.floor(seconds));
      return state;
    },
    totalsForDisplay(state, at) {
      return { today: Number(state.totals[dayKey(at)]) || 0, yesterday: Number(state.totals[yesterdayKey(at)]) || 0 };
    }
  };
})();

const $ = (selector) => document.querySelector(selector);
const els = {
  shell: $('#appShell'), timerText: $('#timerText'), timerButton: $('#timerButton'), primary: $('#primaryButton'), stop: $('#stopButton'),
  intention: $('#intentionText'), expanded: $('#expandedPanel'), dialog: $('#intentionDialog'), intentionForm: $('#intentionForm'),
  intentionInput: $('#intentionInput'), finishedDialog: $('#finishedDialog'), finishedTitle: $('#finishedTitle'),
  finishedIntention: $('#finishedIntention'), silence: $('#silenceButton'),
  today: $('#todayTotal'), yesterday: $('#yesterdayTotal'), customMinutes: $('#customMinutes'),
  reportDialog: $('#reportDialog'), reportList: $('#reportList'), reportTotal: $('#reportTotal'),
  tagSection: $('#tagSection'), tagList: $('#tagList'), settingsDialog: $('#settingsDialog'),
  opacityRange: $('#opacityRange'), opacityValue: $('#opacityValue'), themeSetting: $('#themeSetting'),
  alwaysOnTopSetting: $('#alwaysOnTopSetting'), adaptiveContrastSetting: $('#adaptiveContrastSetting')
};

let state;
let durationSeconds = 30 * 60;
let remainingSeconds = durationSeconds;
let running = false;
let tickHandle;
let audioContext;
let alarmHandle;

function formatClock(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatTotal(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const restSeconds = Math.floor(seconds % 60);
    return restSeconds ? `${minutes}m ${restSeconds}s` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function updateTotals() {
  const totals = totalsForDisplay(state, new Date());
  els.today.textContent = formatTotal(totals.today);
  els.yesterday.textContent = formatTotal(totals.yesterday);
}

function render() {
  els.timerText.textContent = formatClock(remainingSeconds);
  document.body.classList.toggle('running', running);
  els.primary.textContent = running ? 'PAUSAR' : (remainingSeconds < durationSeconds ? 'CONTINUAR' : 'COMEÇAR');
  els.stop.disabled = !state.session;
  els.themeSetting.textContent = state.theme === 'dark' ? 'ESCURO' : 'CLARO';
  els.alwaysOnTopSetting.checked = state.alwaysOnTop;
  els.adaptiveContrastSetting.checked = state.adaptiveContrast === true;
  updateTotals();
  window.focusAPI.broadcastTimer({
    time: formatClock(remainingSeconds),
    intention: state.session?.intention || '',
    running,
    finished: Boolean(alarmHandle),
    theme: state.theme,
    backgroundOpacity: state.floatingOpacity,
    adaptiveContrast: state.adaptiveContrast === true
  });
}

async function persist() {
  state = await window.focusAPI.saveState(state);
}

function currentElapsed() {
  if (!state.session) return durationSeconds - remainingSeconds;
  const prior = Number(state.session.elapsedSeconds) || 0;
  if (!state.session.startedAt) return prior;
  return Math.min(durationSeconds, prior + (Date.now() - state.session.startedAt) / 1000);
}

function checkpoint(keepRunning = running) {
  if (!state.session) return;
  state.session.elapsedSeconds = currentElapsed();
  state.session.startedAt = keepRunning ? Date.now() : null;
  remainingSeconds = Math.max(0, durationSeconds - state.session.elapsedSeconds);
  persist();
}

async function accountProgress(totalElapsed, keepRunning = false) {
  if (!state.session) return;
  const accounted = Math.max(0, Math.floor(Number(state.session.accountedSeconds) || 0));
  const completed = Math.max(accounted, Math.min(durationSeconds, Math.floor(totalElapsed)));
  const newSeconds = completed - accounted;
  if (newSeconds > 0) {
    state = addFocusedSeconds(state, newSeconds, new Date());
    state.entries ??= [];
    state.entries.push({
      task: state.session.intention,
      seconds: newSeconds,
      day: (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      })()
    });
  }
  state.session.elapsedSeconds = Math.min(durationSeconds, totalElapsed);
  state.session.accountedSeconds = completed;
  state.session.startedAt = keepRunning ? Date.now() : null;
  remainingSeconds = Math.max(0, durationSeconds - state.session.elapsedSeconds);
  await persist();
}

function tick() {
  if (!running || !state.session) return;
  remainingSeconds = Math.max(0, durationSeconds - currentElapsed());
  render();
  if (remainingSeconds <= 0) finishSession();
}

function startTicking() {
  clearInterval(tickHandle);
  tickHandle = setInterval(tick, 250);
}

function openIntentionDialog() {
  els.intentionInput.value = '';
  renderTags();
  els.dialog.showModal();
  setTimeout(() => els.intentionInput.focus(), 50);
}

function renderTags() {
  els.tagList.replaceChildren();
  const tags = Array.isArray(state.tags) ? state.tags : [];
  els.tagSection.hidden = tags.length === 0;
  for (const tag of tags) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-chip';
    button.textContent = tag;
    button.title = tag;
    button.addEventListener('click', () => {
      els.intentionInput.value = tag;
      els.intentionInput.focus();
    });
    els.tagList.append(button);
  }
}

function rememberTag(intention) {
  state.tags ??= [];
  const key = normalizeTaskKey(intention);
  const existing = state.tags.find(tag => normalizeTaskKey(tag) === key);
  const canonical = existing || intention.trim();
  state.tags = [canonical, ...state.tags.filter(tag => normalizeTaskKey(tag) !== key)].slice(0, 24);
  return canonical;
}

async function beginSession(intention) {
  intention = rememberTag(intention);
  running = true;
  remainingSeconds = durationSeconds;
  state.session = { intention, durationSeconds, elapsedSeconds: 0, accountedSeconds: 0, startedAt: Date.now(), createdAt: Date.now() };
  els.intention.textContent = intention;
  await persist();
  startTicking();
  render();
}

async function toggleTimer() {
  if (!state.session || remainingSeconds >= durationSeconds) {
    openIntentionDialog();
    return;
  }
  if (running) {
    const elapsed = currentElapsed();
    running = false;
    clearInterval(tickHandle);
    await accountProgress(elapsed, false);
  } else {
    running = true;
    state.session.startedAt = Date.now();
    await persist();
    startTicking();
  }
  render();
}

function beep() {
  audioContext ??= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
  gain.gain.setValueAtTime(.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.22, audioContext.currentTime + .03);
  gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .55);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + .6);
}

function startAlarm() {
  beep();
  alarmHandle = setInterval(beep, 900);
  document.body.classList.add('finished');
}

function stopAlarm() {
  clearInterval(alarmHandle);
  alarmHandle = null;
  document.body.classList.remove('finished');
  els.finishedDialog.close();
}

function acknowledgeFinishedSession() {
  stopAlarm();
  remainingSeconds = durationSeconds;
  els.intention.textContent = 'Defina um tempo para o que importa agora.';
  render();
}

async function stopSession() {
  if (!state.session) return;
  clearInterval(tickHandle);
  if (running) {
    const elapsed = currentElapsed();
    running = false;
    await accountProgress(elapsed, false);
  }
  state.session = null;
  remainingSeconds = durationSeconds;
  els.intention.textContent = 'Defina um tempo para o que importa agora.';
  await persist();
  render();
}

async function finishSession() {
  clearInterval(tickHandle);
  const completed = state.session;
  running = false;
  remainingSeconds = 0;
  await accountProgress(completed.durationSeconds, false);
  state.session = null;
  await persist();
  els.finishedTitle.textContent = `Você investiu ${formatTotal(completed.durationSeconds)}.`;
  els.finishedIntention.textContent = completed.intention;
  els.finishedDialog.showModal();
  startAlarm();
  render();
}

function chooseDuration(minutes, source = 'preset') {
  if (running) return;
  durationSeconds = minutes * 60;
  remainingSeconds = durationSeconds;
  state.session = null;
  document.querySelectorAll('[data-minutes]').forEach(button => button.classList.toggle('selected', source === 'preset' && Number(button.dataset.minutes) === minutes));
  els.customMinutes.closest('.custom-time').classList.toggle('selected', source === 'custom');
  if (source === 'preset') els.customMinutes.value = '';
  render();
  persist();
}

function showTodayReport() {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const grouped = new Map();
  for (const entry of state.entries || []) {
    if (entry.day !== day) continue;
    const task = String(entry.task || '').trim();
    if (!task) continue;
    const key = normalizeTaskKey(task);
    const current = grouped.get(key) || { task, seconds: 0 };
    current.seconds += Math.max(0, Number(entry.seconds) || 0);
    grouped.set(key, current);
  }
  const rows = [...grouped.values()].sort((a, b) => b.seconds - a.seconds);
  els.reportList.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'report-empty';
    empty.textContent = 'Nenhuma atividade cronometrada hoje.';
    els.reportList.append(empty);
  } else {
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = 'report-row';
      const name = document.createElement('span');
      name.textContent = row.task;
      name.title = row.task;
      const time = document.createElement('strong');
      time.textContent = formatTotal(row.seconds);
      item.append(name, time);
      els.reportList.append(item);
    }
  }
  els.reportTotal.textContent = formatTotal(rows.reduce((sum, row) => sum + row.seconds, 0));
  els.reportDialog.showModal();
}

async function restoreSession() {
  if (!state.session) return;
  durationSeconds = Number(state.session.durationSeconds) || 1800;
  els.intention.textContent = state.session.intention || 'Sessão de foco';
  const elapsed = Number(state.session.elapsedSeconds) || 0;
  state.session.accountedSeconds = Math.min(elapsed, Number(state.session.accountedSeconds) || 0);
  if (state.session.startedAt) {
    state.session.elapsedSeconds = Math.min(durationSeconds, elapsed + (Date.now() - state.session.startedAt) / 1000);
    state.session.startedAt = Date.now();
    running = true;
  }
  remainingSeconds = Math.max(0, durationSeconds - state.session.elapsedSeconds);
  if (remainingSeconds <= 0) await finishSession();
  else if (running) startTicking();
}

document.querySelectorAll('[data-minutes]').forEach(button => button.addEventListener('click', () => chooseDuration(Number(button.dataset.minutes))));
function applyCustomMinutes() {
  const minutes = Math.min(999, Math.max(1, Number(els.customMinutes.value) || 0));
  if (minutes) chooseDuration(minutes, 'custom');
}
els.customMinutes.addEventListener('focus', () => {
  if (running) return;
  document.querySelectorAll('[data-minutes]').forEach(button => button.classList.remove('selected'));
  els.customMinutes.closest('.custom-time').classList.add('selected');
});
els.customMinutes.addEventListener('input', applyCustomMinutes);
els.customMinutes.addEventListener('change', applyCustomMinutes);
els.customMinutes.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    applyCustomMinutes();
    els.customMinutes.blur();
  }
});
els.primary.addEventListener('click', toggleTimer);
els.timerButton.addEventListener('click', toggleTimer);
els.stop.addEventListener('click', stopSession);
els.intentionForm.addEventListener('submit', event => {
  event.preventDefault();
  const intention = els.intentionInput.value.trim();
  if (!intention) return els.intentionInput.focus();
  els.dialog.close();
  beginSession(intention);
});
$('#cancelIntention').addEventListener('click', () => els.dialog.close());
$('#reportButton').addEventListener('click', showTodayReport);
$('#closeReport').addEventListener('click', () => els.reportDialog.close());
$('#settingsButton').addEventListener('click', () => {
  const opacity = Number.isFinite(Number(state.floatingOpacity)) ? Number(state.floatingOpacity) : 0.92;
  const percent = Math.round(opacity * 100);
  els.opacityRange.value = String(percent);
  els.opacityValue.textContent = `${percent}%`;
  els.themeSetting.textContent = state.theme === 'dark' ? 'ESCURO' : 'CLARO';
  els.alwaysOnTopSetting.checked = state.alwaysOnTop;
  els.adaptiveContrastSetting.checked = state.adaptiveContrast === true;
  els.settingsDialog.showModal();
});
$('#closeSettings').addEventListener('click', () => els.settingsDialog.close());
els.opacityRange.addEventListener('input', () => {
  const percent = Number(els.opacityRange.value);
  state.floatingOpacity = percent / 100;
  els.opacityValue.textContent = `${percent}%`;
  render();
});
els.opacityRange.addEventListener('change', persist);
$('#floatModeButton').addEventListener('click', async () => {
  await window.focusAPI.enterFloatingMode();
  setTimeout(render, 200);
});
els.silence.addEventListener('click', () => {
  acknowledgeFinishedSession();
});
els.themeSetting.addEventListener('click', async () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  await persist();
  render();
});
els.alwaysOnTopSetting.addEventListener('change', async () => {
  state.alwaysOnTop = els.alwaysOnTopSetting.checked;
  await window.focusAPI.setAlwaysOnTop(state.alwaysOnTop);
  await persist();
  render();
});
els.adaptiveContrastSetting.addEventListener('change', async () => {
  state.adaptiveContrast = els.adaptiveContrastSetting.checked;
  await persist();
  render();
});
$('#minimizeButton').addEventListener('click', () => window.focusAPI.minimize());
$('#closeButton').addEventListener('click', async () => {
  if (running && state.session) {
    const elapsed = currentElapsed();
    running = false;
    await accountProgress(elapsed, false);
  }
  window.focusAPI.close();
});
window.focusAPI.onTimerCommand(command => {
  if (command === 'toggle') toggleTimer();
  if (command === 'silence' && alarmHandle) {
    acknowledgeFinishedSession();
    window.focusAPI.dockFloating();
  }
  if (command === 'sync') render();
});

(async function init() {
  state = await window.focusAPI.loadState();
  document.documentElement.dataset.theme = state.theme;
  await window.focusAPI.setAlwaysOnTop(state.alwaysOnTop);
  await restoreSession();
  render();
})();
