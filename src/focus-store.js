const DAY_MS = 24 * 60 * 60 * 1000;

function localDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function yesterdayKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setDate(date.getDate() - 1);
  return localDayKey(date);
}

function createEmptyState() {
  return {
    theme: 'dark',
    alwaysOnTop: true,
    totals: {},
    entries: [],
    fixedTags: [],
    temporaryTags: [],
    temporaryTagsDay: localDayKey(),
    todos: [],
    floatingOpacity: 0.92,
    session: null
  };
}

function normalizeState(value) {
  const base = createEmptyState();
  if (!value || typeof value !== 'object') return base;
  return {
    theme: value.theme === 'dark' ? 'dark' : 'light',
    alwaysOnTop: value.alwaysOnTop !== false,
    totals: value.totals && typeof value.totals === 'object' ? value.totals : {},
    entries: Array.isArray(value.entries) ? value.entries.map(entry => ({
      ...entry,
      taskId: entry?.taskId ? String(entry.taskId) : null
    })) : [],
    fixedTags: Array.isArray(value.fixedTags) ? value.fixedTags : [],
    temporaryTags: value.temporaryTagsDay === localDayKey() && Array.isArray(value.temporaryTags) ? value.temporaryTags : [],
    temporaryTagsDay: localDayKey(),
    todos: Array.isArray(value.todos) ? value.todos
      .filter(todo => todo && typeof todo === 'object' && String(todo.text || '').trim())
      .map((todo, index) => ({
        id: String(todo.id || `legacy-${index}-${normalizeTaskKey(todo.text)}`),
        text: String(todo.text).trim().slice(0, 120),
        category: String(todo.category || '').trim().slice(0, 40) || null,
        completed: todo.completed === true
      })) : [],
    floatingOpacity: Math.max(0, Math.min(1, Number.isFinite(Number(value.floatingOpacity)) ? Number(value.floatingOpacity) : 0.92)),
    session: value.session && typeof value.session === 'object' ? {
      ...value.session,
      taskId: value.session.taskId ? String(value.session.taskId) : null
    } : null
  };
}

function totalsForDisplay(state, now = new Date()) {
  const normalized = normalizeState(state);
  return {
    today: Math.max(0, Number(normalized.totals[localDayKey(now)]) || 0),
    yesterday: Math.max(0, Number(normalized.totals[yesterdayKey(now)]) || 0)
  };
}

function addFocusedSeconds(state, seconds, at = new Date()) {
  const normalized = normalizeState(state);
  const key = localDayKey(at);
  normalized.totals[key] = Math.max(0, Number(normalized.totals[key]) || 0) + Math.max(0, Math.floor(seconds));
  return normalized;
}

function addTaskSeconds(state, task, seconds, at = new Date(), taskId = null) {
  const normalized = normalizeState(state);
  const amount = Math.max(0, Math.floor(seconds));
  const name = String(task || '').trim();
  if (!name || amount <= 0) return normalized;
  normalized.entries.push({ task: name, taskId: taskId ? String(taskId) : null, seconds: amount, day: localDayKey(at) });
  return normalized;
}

function normalizeTaskKey(task) {
  return String(task || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function taskReportForDay(state, at = new Date()) {
  const normalized = normalizeState(state);
  const day = localDayKey(at);
  const grouped = new Map();
  for (const entry of normalized.entries) {
    if (entry.day !== day) continue;
    const task = String(entry.task || '').trim();
    if (!task) continue;
    const key = normalizeTaskKey(task);
    const current = grouped.get(key) || { task, seconds: 0 };
    current.seconds += Math.max(0, Number(entry.seconds) || 0);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.seconds - a.seconds);
}

function weeklyTotal(state, now = new Date()) {
  const normalized = normalizeState(state);
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  let total = 0;
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    if (day > now) break;
    total += Math.max(0, Number(normalized.totals[localDayKey(day)]) || 0);
  }
  return total;
}

function focusStreak(state, now = new Date()) {
  const normalized = normalizeState(state);
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  if (!(Number(normalized.totals[localDayKey(day)]) > 0)) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (Number(normalized.totals[localDayKey(day)]) > 0) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function taskSecondsForDay(state, todo, at = new Date()) {
  const normalized = normalizeState(state);
  const day = localDayKey(at);
  const taskId = String(todo?.id || '');
  const taskKey = normalizeTaskKey(todo?.text);
  return normalized.entries.reduce((total, entry) => {
    if (entry.day !== day) return total;
    const matchesId = taskId && entry.taskId === taskId;
    const matchesLegacyName = !entry.taskId && normalizeTaskKey(entry.task) === taskKey;
    return total + (matchesId || matchesLegacyName ? Math.max(0, Number(entry.seconds) || 0) : 0);
  }, 0);
}

function pruneTotals(state, now = new Date(), daysToKeep = 400) {
  const normalized = normalizeState(state);
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setTime(cutoff.getTime() - daysToKeep * DAY_MS);
  normalized.totals = Object.fromEntries(
    Object.entries(normalized.totals).filter(([key]) => new Date(`${key}T00:00:00`).getTime() >= cutoff.getTime())
  );
  normalized.entries = normalized.entries.filter(entry => new Date(`${entry.day}T00:00:00`).getTime() >= cutoff.getTime());
  return normalized;
}

module.exports = {
  addFocusedSeconds,
  addTaskSeconds,
  createEmptyState,
  localDayKey,
  normalizeTaskKey,
  normalizeState,
  pruneTotals,
  focusStreak,
  taskSecondsForDay,
  totalsForDisplay,
  taskReportForDay,
  weeklyTotal,
  yesterdayKey
};
