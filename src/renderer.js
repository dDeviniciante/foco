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
  intention: $('#intentionText'), activeTaskLabel: $('#activeTaskLabel'), focusHeading: $('#focusHeading'), focusSubheading: $('#focusSubheading'), dialog: $('#intentionDialog'), intentionForm: $('#intentionForm'),
  intentionInput: $('#intentionInput'), finishedDialog: $('#finishedDialog'), finishedTitle: $('#finishedTitle'),
  finishedIntention: $('#finishedIntention'), silence: $('#silenceButton'),
  today: $('#todayTotal'), yesterday: $('#yesterdayTotal'), week: $('#weekTotal'), streak: $('#streakTotal'),
  todayComparison: $('#todayComparison'), streakMessage: $('#streakMessage'), customMinutes: $('#customMinutes'),
  reportDialog: $('#reportDialog'), reportList: $('#reportList'), reportTotal: $('#reportTotal'),
  tagSection: $('#tagSection'), fixedTagList: $('#fixedTagList'), temporaryTagList: $('#temporaryTagList'),
  temporaryTagGroup: $('#temporaryTagGroup'), addTagForm: $('#addTagForm'), fixedTagInput: $('#fixedTagInput'), settingsDialog: $('#settingsDialog'),
  opacityRange: $('#opacityRange'), opacityValue: $('#opacityValue'), themeSetting: $('#themeSetting'),
  alwaysOnTopSetting: $('#alwaysOnTopSetting'), todoList: $('#todoList'), todoCount: $('#todoCount'),
  taskDialog: $('#taskDialog'), taskForm: $('#taskForm'), taskDialogTitle: $('#taskDialogTitle'), taskIdInput: $('#taskIdInput'),
  taskNameInput: $('#taskNameInput'), taskCategoryInput: $('#taskCategoryInput'), categorySuggestions: $('#categorySuggestions')
};

let state;
let durationSeconds = 30 * 60;
let remainingSeconds = durationSeconds;
let running = false;
let tickHandle;
let audioContext;
let alarmHandle;
let selectedTodoId = null;
let openTodoMenuId = null;
let finishedIntentionName = '';

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
  const difference = totals.today - totals.yesterday;
  els.todayComparison.textContent = difference > 0 ? `↑ ${formatTotal(difference)} a mais que ontem` : difference < 0 ? `${formatTotal(Math.abs(difference))} abaixo de ontem` : totals.today ? 'Mesmo ritmo de ontem' : 'Comece seu primeiro foco';
  els.week.textContent = formatTotal(weekSeconds());
  const streak = focusStreak();
  els.streak.textContent = `${streak} ${streak === 1 ? 'dia' : 'dias'}`;
  els.streakMessage.textContent = streak ? 'Continue assim!' : 'Um dia de cada vez';
}

function weekSeconds() {
  const today = new Date();
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  let total = 0;
  for (let date = new Date(monday); date <= today; date.setDate(date.getDate() + 1)) total += Math.max(0, Number(state.totals?.[dayKey(date)]) || 0);
  return total;
}

function focusStreak() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (!(Number(state.totals?.[dayKey(date)]) > 0)) date.setDate(date.getDate() - 1);
  let count = 0;
  while (Number(state.totals?.[dayKey(date)]) > 0) {
    count += 1;
    date.setDate(date.getDate() - 1);
  }
  return count;
}

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todoSecondsToday(todo) {
  const key = normalizeTaskKey(todo.text);
  const recorded = (state.entries || []).reduce((total, entry) => {
    if (entry.day !== dayKey()) return total;
    const matchesId = entry.taskId && entry.taskId === todo.id;
    const matchesLegacy = !entry.taskId && normalizeTaskKey(entry.task) === key;
    return total + (matchesId || matchesLegacy ? Math.max(0, Number(entry.seconds) || 0) : 0);
  }, 0);
  const matchesActive = state.session && (state.session.taskId === todo.id || (!state.session.taskId && normalizeTaskKey(state.session.intention) === key));
  const live = matchesActive ? Math.max(0, Math.floor(currentElapsed()) - Math.floor(Number(state.session.accountedSeconds) || 0)) : 0;
  return recorded + live;
}

function categoryTone(category) {
  let value = 0;
  for (const character of category || '') value = ((value * 31) + character.charCodeAt(0)) >>> 0;
  return `category-tone-${value % 5}`;
}

function renderTodos() {
  state.todos ??= [];
  els.todoList.replaceChildren();
  const pending = state.todos.filter(todo => !todo.completed).length;
  els.todoCount.textContent = `${pending} ${pending === 1 ? 'pendente' : 'pendentes'}`;
  if (state.todos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'todo-empty';
    empty.textContent = 'Seu dia está livre. Adicione uma tarefa para começar.';
    els.todoList.append(empty);
    return;
  }
  for (const todo of state.todos) {
    const row = document.createElement('div');
    row.className = 'todo-item';
    row.classList.toggle('completed', todo.completed);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.disabled = state.session?.taskId === todo.id;
    if (checkbox.disabled) checkbox.title = 'Encerre o foco antes de concluir esta tarefa';
    checkbox.setAttribute('aria-label', `Concluir ${todo.text}`);
    checkbox.addEventListener('change', async () => {
      todo.completed = checkbox.checked;
      if (todo.completed && selectedTodoId === todo.id && !state.session) selectedTodoId = null;
      await persist();
      renderTodos();
      render();
    });
    const content = document.createElement('div');
    content.className = 'todo-content';
    const titleLine = document.createElement('div');
    titleLine.className = 'todo-title-line';
    const name = document.createElement('span');
    name.className = 'todo-name';
    name.textContent = todo.text;
    name.title = todo.text;
    titleLine.append(name);
    if (todo.category) {
      const badge = document.createElement('span');
      badge.className = `category-badge ${categoryTone(todo.category)}`;
      badge.textContent = todo.category;
      titleLine.append(badge);
    }
    const time = document.createElement('small');
    time.className = 'todo-time';
    time.dataset.todoTimeId = todo.id;
    const seconds = todoSecondsToday(todo);
    time.textContent = `${formatTotal(seconds)} hoje`;
    content.append(titleLine, time);

    const focusButton = document.createElement('button');
    focusButton.type = 'button';
    focusButton.className = 'task-focus-button';
    const isSessionTask = state.session?.taskId === todo.id;
    const isSelected = !state.session && selectedTodoId === todo.id;
    focusButton.classList.toggle('selected', isSessionTask || isSelected);
    focusButton.classList.toggle('completion-label', todo.completed);
    focusButton.textContent = todo.completed ? 'CONCLUÍDA' : isSessionTask ? '● EM FOCO' : isSelected ? '✓ SELECIONADA' : '▶ INICIAR FOCO';
    focusButton.disabled = todo.completed || Boolean(state.session && !isSessionTask);
    focusButton.addEventListener('click', () => {
      if (state.session || todo.completed) return;
      selectedTodoId = selectedTodoId === todo.id ? null : todo.id;
      openTodoMenuId = null;
      renderTodos();
      render();
      document.querySelector('.app-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'todo-menu-button';
    menuButton.textContent = '⋮';
    menuButton.title = 'Ações da tarefa';
    menuButton.setAttribute('aria-label', `Ações de ${todo.text}`);
    menuButton.addEventListener('click', event => {
      event.stopPropagation();
      openTodoMenuId = openTodoMenuId === todo.id ? null : todo.id;
      renderTodos();
    });
    row.append(checkbox, content, focusButton, menuButton);

    if (openTodoMenuId === todo.id) {
      const menu = document.createElement('div');
      menu.className = 'todo-menu';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Editar tarefa';
      edit.addEventListener('click', () => openTaskDialog(todo));
      const category = document.createElement('button');
      category.type = 'button';
      category.textContent = 'Alterar categoria';
      category.addEventListener('click', () => openTaskDialog(todo, true));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Excluir';
      remove.addEventListener('click', async () => {
        if (state.session?.taskId === todo.id) return;
        state.todos = state.todos.filter(item => item.id !== todo.id);
        if (selectedTodoId === todo.id) selectedTodoId = null;
        openTodoMenuId = null;
        await persist();
        renderTodos();
        render();
      });
      if (state.session?.taskId === todo.id) {
        remove.disabled = true;
        remove.title = 'Encerre o foco antes de excluir esta tarefa';
      }
      menu.append(edit, category, remove);
      row.append(menu);
    }
    els.todoList.append(row);
  }
}

function updateTodoTimes() {
  for (const element of els.todoList.querySelectorAll('[data-todo-time-id]')) {
    const todo = state.todos.find(item => item.id === element.dataset.todoTimeId);
    if (todo) element.textContent = `${formatTotal(todoSecondsToday(todo))} hoje`;
  }
}

function updateCategorySuggestions() {
  els.categorySuggestions.replaceChildren();
  const categories = [...new Set(state.todos.map(todo => todo.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category;
    els.categorySuggestions.append(option);
  }
}

function openTaskDialog(todo = null, focusCategory = false) {
  openTodoMenuId = null;
  els.taskNameInput.setCustomValidity('');
  els.taskIdInput.value = todo?.id || '';
  els.taskNameInput.value = todo?.text || '';
  els.taskCategoryInput.value = todo?.category || '';
  els.taskDialogTitle.textContent = todo ? 'Editar tarefa' : 'Adicionar tarefa';
  updateCategorySuggestions();
  els.taskDialog.showModal();
  setTimeout(() => (focusCategory ? els.taskCategoryInput : els.taskNameInput).focus(), 50);
}

async function saveTask(event) {
  event.preventDefault();
  const text = els.taskNameInput.value.trim();
  if (!text) return els.taskNameInput.focus();
  const category = els.taskCategoryInput.value.trim() || null;
  const id = els.taskIdInput.value;
  const duplicate = state.todos.find(todo => todo.id !== id && normalizeTaskKey(todo.text) === normalizeTaskKey(text));
  if (duplicate) {
    els.taskNameInput.setCustomValidity('Já existe uma tarefa com esse nome.');
    els.taskNameInput.reportValidity();
    return;
  }
  if (id) {
    const todo = state.todos.find(item => item.id === id);
    if (!todo) return els.taskDialog.close();
    const oldKey = normalizeTaskKey(todo.text);
    for (const entry of state.entries || []) {
      if (entry.taskId === id || (!entry.taskId && normalizeTaskKey(entry.task) === oldKey)) {
        entry.taskId = id;
        entry.task = text;
      }
    }
    todo.text = text;
    todo.category = category;
    if (state.session?.taskId === id) state.session.intention = text;
  } else {
    state.todos.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, category, completed: false });
  }
  els.taskDialog.close();
  await persist();
  renderTodos();
  render();
}

function render() {
  els.timerText.textContent = formatClock(remainingSeconds);
  document.body.classList.toggle('running', running);
  const selectedTodo = state.todos?.find(todo => todo.id === selectedTodoId);
  const activeIntention = state.session?.intention || finishedIntentionName || selectedTodo?.text || '';
  els.activeTaskLabel.hidden = !activeIntention;
  els.intention.textContent = activeIntention || 'Escolha uma tarefa ou descreva uma atividade ao começar.';
  els.focusHeading.textContent = state.session ? (running ? 'Sessão em andamento' : 'Sessão pausada') : selectedTodo ? 'Tarefa selecionada' : 'Pronto para focar?';
  els.focusSubheading.textContent = state.session ? 'Cada minuto conta. Continue no seu ritmo.' : selectedTodo ? 'Defina o tempo e comece quando estiver pronto.' : 'Escolha uma tarefa, defina o tempo e comece.';
  els.primary.innerHTML = running ? 'Ⅱ&nbsp;&nbsp; PAUSAR' : (remainingSeconds < durationSeconds ? '▶&nbsp;&nbsp; CONTINUAR' : '▶&nbsp;&nbsp; COMEÇAR');
  els.stop.disabled = !state.session;
  document.querySelectorAll('[data-minutes]').forEach(button => { button.disabled = Boolean(state.session); });
  els.customMinutes.disabled = Boolean(state.session);
  els.themeSetting.textContent = state.theme === 'dark' ? 'ESCURO' : 'CLARO';
  els.alwaysOnTopSetting.checked = state.alwaysOnTop;
  updateTotals();
  updateTodoTimes();
  window.focusAPI.broadcastTimer({
    time: formatClock(remainingSeconds),
    intention: state.session?.intention || finishedIntentionName || selectedTodo?.text || '',
    running,
    finished: Boolean(alarmHandle),
    theme: state.theme,
    backgroundOpacity: state.floatingOpacity,
    progress: durationSeconds > 0 ? Math.max(0, Math.min(1, remainingSeconds / durationSeconds)) : 0,
    hasSession: Boolean(state.session)
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
      taskId: state.session.taskId || null,
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
  renderTodos();
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
  els.addTagForm.hidden = true;
  els.fixedTagInput.value = '';
  renderTags();
  els.dialog.showModal();
  setTimeout(() => els.intentionInput.focus(), 50);
}

function renderTags() {
  ensureTemporaryTagsToday();
  els.fixedTagList.replaceChildren();
  els.temporaryTagList.replaceChildren();
  const fixedTags = Array.isArray(state.fixedTags) ? state.fixedTags : [];
  const temporaryTags = Array.isArray(state.temporaryTags) ? state.temporaryTags : [];

  for (const tag of fixedTags) {
    const chip = document.createElement('div');
    chip.className = 'tag-chip fixed-tag-chip';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-select';
    button.textContent = tag;
    button.title = tag;
    button.addEventListener('click', () => {
      els.intentionInput.value = tag;
      els.intentionInput.focus();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tag-remove';
    remove.textContent = '×';
    remove.title = `Excluir ${tag}`;
    remove.setAttribute('aria-label', `Excluir tag ${tag}`);
    remove.addEventListener('click', async () => {
      state.fixedTags = state.fixedTags.filter(item => normalizeTaskKey(item) !== normalizeTaskKey(tag));
      await persist();
      renderTags();
    });
    chip.append(button, remove);
    els.fixedTagList.append(chip);
  }

  for (const tag of temporaryTags) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-chip';
    button.textContent = tag;
    button.title = tag;
    button.addEventListener('click', () => {
      els.intentionInput.value = tag;
      els.intentionInput.focus();
    });
    els.temporaryTagList.append(button);
  }
  els.temporaryTagGroup.hidden = temporaryTags.length === 0;
}

function currentDayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function ensureTemporaryTagsToday() {
  const today = currentDayKey();
  if (state.temporaryTagsDay === today) return;
  state.temporaryTags = [];
  state.temporaryTagsDay = today;
}

function rememberTag(intention) {
  ensureTemporaryTagsToday();
  state.fixedTags ??= [];
  state.temporaryTags ??= [];
  const key = normalizeTaskKey(intention);
  const fixed = state.fixedTags.find(tag => normalizeTaskKey(tag) === key);
  if (fixed) return fixed;
  const existing = state.temporaryTags.find(tag => normalizeTaskKey(tag) === key);
  const canonical = existing || intention.trim();
  state.temporaryTags = [canonical, ...state.temporaryTags.filter(tag => normalizeTaskKey(tag) !== key)].slice(0, 24);
  return canonical;
}

async function addFixedTag() {
  const name = els.fixedTagInput.value.trim();
  if (!name) return els.fixedTagInput.focus();
  ensureTemporaryTagsToday();
  const key = normalizeTaskKey(name);
  const existing = state.fixedTags.find(tag => normalizeTaskKey(tag) === key);
  state.fixedTags = [existing || name, ...state.fixedTags.filter(tag => normalizeTaskKey(tag) !== key)].slice(0, 40);
  state.temporaryTags = state.temporaryTags.filter(tag => normalizeTaskKey(tag) !== key);
  els.fixedTagInput.value = '';
  els.addTagForm.hidden = true;
  await persist();
  renderTags();
}

async function beginSession(intention, taskId = null) {
  intention = rememberTag(intention);
  if (!taskId) taskId = state.todos?.find(todo => normalizeTaskKey(todo.text) === normalizeTaskKey(intention))?.id || null;
  running = true;
  remainingSeconds = durationSeconds;
  selectedTodoId = taskId;
  state.session = { intention, taskId, durationSeconds, elapsedSeconds: 0, accountedSeconds: 0, startedAt: Date.now(), createdAt: Date.now() };
  await persist();
  startTicking();
  renderTodos();
  render();
}

async function toggleTimer() {
  if (!state.session || remainingSeconds >= durationSeconds) {
    const selectedTodo = state.todos?.find(todo => todo.id === selectedTodoId && !todo.completed);
    if (selectedTodo) {
      await beginSession(selectedTodo.text, selectedTodo.id);
      return;
    }
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
  finishedIntentionName = '';
  remainingSeconds = durationSeconds;
  selectedTodoId = null;
  renderTodos();
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
  finishedIntentionName = '';
  selectedTodoId = null;
  remainingSeconds = durationSeconds;
  await persist();
  renderTodos();
  render();
}

async function finishSession() {
  clearInterval(tickHandle);
  const completed = state.session;
  finishedIntentionName = completed.intention;
  running = false;
  remainingSeconds = 0;
  await accountProgress(completed.durationSeconds, false);
  state.session = null;
  selectedTodoId = null;
  await persist();
  els.finishedTitle.textContent = `Você investiu ${formatTotal(completed.durationSeconds)}.`;
  els.finishedIntention.textContent = completed.intention;
  els.finishedDialog.showModal();
  startAlarm();
  renderTodos();
  render();
}

function chooseDuration(minutes, source = 'preset') {
  if (state.session) return;
  durationSeconds = minutes * 60;
  remainingSeconds = durationSeconds;
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
  selectedTodoId = state.session.taskId || null;
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
$('#addTodoButton').addEventListener('click', () => openTaskDialog());
els.taskForm.addEventListener('submit', saveTask);
els.taskNameInput.addEventListener('input', () => els.taskNameInput.setCustomValidity(''));
$('#cancelTask').addEventListener('click', () => els.taskDialog.close());
els.intentionForm.addEventListener('submit', event => {
  event.preventDefault();
  const intention = els.intentionInput.value.trim();
  if (!intention) return els.intentionInput.focus();
  els.dialog.close();
  beginSession(intention);
});
$('#cancelIntention').addEventListener('click', () => els.dialog.close());
$('#showAddTag').addEventListener('click', () => {
  els.addTagForm.hidden = false;
  setTimeout(() => els.fixedTagInput.focus(), 0);
});
$('#confirmAddTag').addEventListener('click', addFixedTag);
$('#cancelAddTag').addEventListener('click', () => {
  els.fixedTagInput.value = '';
  els.addTagForm.hidden = true;
});
els.fixedTagInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addFixedTag();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    els.fixedTagInput.value = '';
    els.addTagForm.hidden = true;
    els.intentionInput.focus();
  }
});
$('#reportButton').addEventListener('click', showTodayReport);
$('#closeReport').addEventListener('click', () => els.reportDialog.close());
$('#settingsButton').addEventListener('click', () => {
  const opacity = Number.isFinite(Number(state.floatingOpacity)) ? Number(state.floatingOpacity) : 0.92;
  const percent = Math.round(opacity * 100);
  els.opacityRange.value = String(percent);
  els.opacityValue.textContent = `${percent}%`;
  els.themeSetting.textContent = state.theme === 'dark' ? 'ESCURO' : 'CLARO';
  els.alwaysOnTopSetting.checked = state.alwaysOnTop;
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
$('#fullscreenModeButton').addEventListener('click', async () => {
  await window.focusAPI.enterFullscreenMode();
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
  if (command === 'stop') stopSession();
  if (command === 'silence' && alarmHandle) {
    acknowledgeFinishedSession();
    window.focusAPI.dockFloating();
  }
  if (command === 'sync') render();
});

document.querySelectorAll('.main-resize-zone').forEach(zone => {
  zone.addEventListener('pointerdown', event => {
    event.preventDefault();
    zone.setPointerCapture(event.pointerId);
    let lastX = event.screenX;
    let lastY = event.screenY;
    const edge = zone.dataset.edge;
    const resize = moveEvent => {
      const dx = moveEvent.screenX - lastX;
      const dy = moveEvent.screenY - lastY;
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
      if (dx || dy) window.focusAPI.resizeMainBy(edge, dx, dy);
    };
    const finish = () => {
      zone.removeEventListener('pointermove', resize);
      zone.removeEventListener('pointerup', finish);
      zone.removeEventListener('pointercancel', finish);
    };
    zone.addEventListener('pointermove', resize);
    zone.addEventListener('pointerup', finish);
    zone.addEventListener('pointercancel', finish);
  });
});

document.addEventListener('click', event => {
  if (!openTodoMenuId || event.target.closest('.todo-menu, .todo-menu-button')) return;
  openTodoMenuId = null;
  renderTodos();
});

(async function init() {
  state = await window.focusAPI.loadState();
  document.documentElement.dataset.theme = state.theme;
  await window.focusAPI.setAlwaysOnTop(state.alwaysOnTop);
  await restoreSession();
  renderTodos();
  render();
})();
