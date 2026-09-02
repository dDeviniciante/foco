const test = require('node:test');
const assert = require('node:assert/strict');
const { addFocusedSeconds, addTaskSeconds, createEmptyState, localDayKey, normalizeTaskKey, taskReportForDay, totalsForDisplay, yesterdayKey } = require('../src/focus-store');

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
