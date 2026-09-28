import type { CalendarEvent } from './model';

type DatedEvent = Pick<CalendarEvent, 'date' | 'repeat' | 'repeatEnd'>;
type TimedEvent = Pick<CalendarEvent, 'id' | 'date' | 'repeat' | 'repeatEnd' | 'start' | 'end'>;

const parts = (value: string) => value.split('-').map(Number);
const dayNumber = (value: string) => {
  const [year, month, day] = parts(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

export function validLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = parts(value);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day;
}

export function monthGridDates(monthFirst: string): string[] {
  const [year, month] = parts(monthFirst);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = (first.getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const count = Math.ceil((leading + dayCount) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, 1 - leading + index));
    return date.toISOString().slice(0, 10);
  });
}

export function occursOn(event: DatedEvent, date: string): boolean {
  if (date < event.date || (event.repeatEnd && date > event.repeatEnd)) return false;
  if (event.repeat === 'once') return date === event.date;
  if (event.repeat === 'daily') return true;
  if (event.repeat === 'weekly') return (dayNumber(date) - dayNumber(event.date)) % 7 === 0;
  const [startYear, startMonth, startDay] = parts(event.date);
  const [year, month, day] = parts(date);
  const months = (year - startYear) * 12 + month - startMonth;
  if (months < 0) return false;
  const lastDay = new Date(year, month, 0).getDate();
  return day === Math.min(startDay, lastDay);
}

function nextOccurrence(event: DatedEvent, from: string): string | null {
  const start = from > event.date ? from : event.date;
  if (event.repeat === 'once') return event.date >= start ? event.date : null;
  if (event.repeat === 'daily') return start;
  if (event.repeat === 'weekly') {
    const offset = (dayNumber(start) - dayNumber(event.date)) % 7;
    const target = new Date((dayNumber(start) + (7 - offset) % 7) * 86400000);
    return target.toISOString().slice(0, 10);
  }
  const [startYear, startMonth, startDay] = parts(event.date);
  const [fromYear, fromMonth] = parts(start);
  let months = (fromYear - startYear) * 12 + fromMonth - startMonth;
  while (true) {
    const target = new Date(Date.UTC(startYear, startMonth - 1 + months, 1));
    target.setUTCDate(Math.min(startDay, new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
    const date = target.toISOString().slice(0, 10);
    if (date >= start) return date;
    months++;
  }
}

export function firstConflictDate(a: TimedEvent, b: TimedEvent): string | null {
  if (a.id === b.id || a.start >= b.end || b.start >= a.end) return null;
  const endA = a.repeat === 'once' ? a.date : a.repeatEnd;
  const endB = b.repeat === 'once' ? b.date : b.repeatEnd;
  if (!endA || !endB) return null;
  const limit = endA < endB ? endA : endB;
  const from = a.date > b.date ? a.date : b.date;
  if (from > limit) return null;
  const rank = { once: 0, monthly: 1, weekly: 2, daily: 3 };
  const sparse = rank[a.repeat] <= rank[b.repeat] ? a : b;
  const other = sparse === a ? b : a;
  let date = nextOccurrence(sparse, from);
  while (date && date <= limit) {
    if (occursOn(other, date)) return date;
    const next = new Date((dayNumber(date) + 1) * 86400000);
    date = nextOccurrence(sparse, next.toISOString().slice(0, 10));
  }
  return null;
}
