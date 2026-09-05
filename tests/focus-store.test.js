const test = require('node:test');
const assert = require('node:assert/strict');
const { addFocusedSeconds, addTaskSeconds, createEmptyState, focusStreak, localDayKey, normalizeState, normalizeTaskKey, taskReportForDay, taskSecondsForDay, totalsForDisplay, weeklyTotal, yesterdayKey } = require('../src/focus-store');

test('creates local date keys without UTC conversion', () => {
  const date = new Date(2026, 8, 2, 23, 59);
  assert.equal(localDayKey(date), '2026-09-02');
  assert.equal(yesterdayKey(date), '2026-09-01');
});

test('keeps today and yesterday totals separate', () => {
  let state = createEmptyState();
  state = addFocusedSeconds(state, 1800, new Date(2026, 8, 1, 20));
  state = addFocusedSeconds(state, 3600, new Date(2026, 8, 2, 9));
  assert.deepEqual(totalsForDisplay(state, new Date(2026, 8, 2, 12)), { today: 3600, yesterday: 1800 });
});

test('accumulates multiple focus sessions in the same day', () => {
  let state = createEmptyState();
  const now = new Date(2026, 8, 2, 9);
  state = addFocusedSeconds(state, 1500, now);
  state = addFocusedSeconds(state, 2700, now);
  assert.equal(totalsForDisplay(state, now).today, 4200);
});

test('groups today task entries by description', () => {
  let state = createEmptyState();
  const today = new Date(2026, 8, 2, 12);
  state = addTaskSeconds(state, 'Estudar matemática', 600, today);
  state = addTaskSeconds(state, 'ESTUDAR matematica', 300, today);
  state = addTaskSeconds(state, 'Lavar o sapato', 1500, today);
  assert.deepEqual(taskReportForDay(state, today), [
    { task: 'Lavar o sapato', seconds: 1500 },
    { task: 'Estudar matemática', seconds: 900 }
  ]);
});

test('normalizes accents, capitalization and extra spaces in task names', () => {
  assert.equal(normalizeTaskKey('  Estudar   Matemática! '), normalizeTaskKey('estudar matematica'));
});

test('keeps fixed tags and removes temporary tags from a previous day', () => {
  const state = normalizeState({
    fixedTags: ['Trabalho'],
    temporaryTags: ['Tarefa de ontem'],
    temporaryTagsDay: '2020-01-01'
  });
  assert.deepEqual(state.fixedTags, ['Trabalho']);
  assert.deepEqual(state.temporaryTags, []);
  assert.equal(state.temporaryTagsDay, localDayKey());
});

test('keeps valid to-do items when normalizing saved state', () => {
  const state = normalizeState({ todos: [
    { id: '1', text: '  Revisar matemática  ', completed: true },
    { id: '2', text: '', completed: false }
  ] });
  assert.deepEqual(state.todos, [{ id: '1', text: 'Revisar matemática', category: null, completed: true }]);
});

test('supports optional task categories without breaking older tasks', () => {
  const state = normalizeState({ todos: [
    { id: '1', text: 'Estudar Java', category: 'Estudos', completed: false },
    { text: 'Tarefa antiga', completed: false }
  ] });
  assert.equal(state.todos[0].category, 'Estudos');
  assert.equal(state.todos[1].category, null);
  assert.ok(state.todos[1].id.startsWith('legacy-'));
});

test('associates daily focus with a task id and falls back to legacy names', () => {
  const today = new Date(2026, 8, 5, 10);
  let state = createEmptyState();
  state = addTaskSeconds(state, 'Estudar matemática', 600, today, 'todo-1');
  state = addTaskSeconds(state, 'ESTUDAR MATEMATICA', 300, today);
  assert.equal(taskSecondsForDay(state, { id: 'todo-1', text: 'Estudar matemática' }, today), 900);
});

test('derives the current week total and consecutive focus days', () => {
  const friday = new Date(2026, 8, 4, 12);
  let state = createEmptyState();
  state = addFocusedSeconds(state, 600, new Date(2026, 8, 2, 12));
  state = addFocusedSeconds(state, 900, new Date(2026, 8, 3, 12));
  state = addFocusedSeconds(state, 1200, friday);
  assert.equal(weeklyTotal(state, friday), 2700);
  assert.equal(focusStreak(state, friday), 3);
});
