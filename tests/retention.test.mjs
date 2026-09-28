import assert from 'node:assert/strict';
import test from 'node:test';
import { isExpired, oneMonthAgo, retentionCutoff } from '../src/retention.ts';

test('one calendar month clamps to the last day of a shorter month', () => {
  const cutoff = oneMonthAgo(new Date(2026, 2, 31, 14, 20));
  assert.equal(cutoff.getFullYear(), 2026);
  assert.equal(cutoff.getMonth(), 1);
  assert.equal(cutoff.getDate(), 28);
  assert.equal(cutoff.getHours(), 14);
});

test('retention uses local date and time across a year boundary', () => {
  assert.deepEqual(retentionCutoff(new Date(2026, 0, 15, 9, 30)), {
    date: '2025-12-15', time: '09:30', includeMinute: false,
  });
});

test('record is deleted only after the exact one-month boundary', () => {
  const now = new Date(2026, 8, 28, 12, 30);
  assert.equal(isExpired({ date: '2026-08-28', start: '12:29' }, now), true);
  assert.equal(isExpired({ date: '2026-08-28', start: '12:30' }, now), false);
  assert.equal(isExpired({ date: '2026-08-28', start: '12:31' }, now), false);
});

test('a partial minute crosses the threshold for minute-granularity records', () => {
  const now = new Date(2026, 8, 28, 12, 30, 1);
  assert.equal(retentionCutoff(now).includeMinute, true);
  assert.equal(isExpired({ date: '2026-08-28', start: '12:30' }, now), true);
});
