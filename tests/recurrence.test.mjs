import assert from 'node:assert/strict';
import test from 'node:test';
import { firstConflictDate, monthGridDates, occursOn, validLocalDate } from '../src/recurrence.ts';
import { isExpired } from '../src/retention.ts';

const event = (id, date, repeat, repeatEnd, start = '09:00', end = '10:00') => ({ id, date, repeat, repeatEnd, start, end });

test('repeats are limited by their start and manually entered end', () => {
  const daily = event('a', '2026-09-28', 'daily', '2026-10-02');
  assert.equal(occursOn(daily, '2026-09-27'), false);
  assert.equal(occursOn(daily, '2026-10-02'), true);
  assert.equal(occursOn(daily, '2026-10-03'), false);
  const weekly = event('b', '2026-09-28', 'weekly', '2026-10-12');
  assert.equal(occursOn(weekly, '2026-10-05'), true);
  assert.equal(occursOn(weekly, '2026-10-06'), false);
});

test('monthly recurrence clamps to short months, including year 2100', () => {
  const monthly = event('a', '2099-12-31', 'monthly', '2100-12-31');
  assert.equal(occursOn(monthly, '2100-02-28'), true);
  assert.equal(occursOn(monthly, '2100-02-27'), false);
  assert.equal(occursOn(monthly, '2100-03-31'), true);
  assert.equal(occursOn(monthly, '2101-01-31'), false);
});

test('overlapping single and recurring entries conflict; adjacent times do not', () => {
  const daily = event('a', '2026-09-28', 'daily', '2026-10-05');
  assert.equal(firstConflictDate(daily, event('b', '2026-10-01', 'once', null, '09:30', '10:30')), '2026-10-01');
  assert.equal(firstConflictDate(daily, event('b', '2026-10-01', 'once', null, '10:00', '11:00')), null);
});

test('weekly and monthly series detect a future collision without storing every occurrence', () => {
  const weekly = event('a', '2100-02-28', 'weekly', '2100-12-31');
  const monthly = event('b', '2100-01-31', 'monthly', '2100-12-31');
  assert.equal(firstConflictDate(weekly, monthly), '2100-02-28');
});

test('month grid uses only the needed weeks across current and future years', () => {
  const september = monthGridDates('2026-09-01');
  assert.equal(september.length, 35);
  assert.equal(september[0], '2026-08-31');
  assert.equal(september.at(-1), '2026-10-04');
  const february = monthGridDates('2100-02-01');
  assert.equal(february.length, 28);
  assert.equal(february[0], '2100-02-01');
  assert.equal(february.at(-1), '2100-02-28');
  assert.equal(validLocalDate('2100-02-29'), false);
});

test('retention keeps a recurring series until one month after its end', () => {
  const recurring = event('a', '2026-01-01', 'weekly', '2026-09-28');
  assert.equal(isExpired(recurring, new Date(2026, 8, 28, 12)), false);
  assert.equal(isExpired(recurring, new Date(2026, 10, 1, 12)), true);
});
