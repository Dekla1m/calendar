export type Category = { id: string; name: string; system: boolean };
export type Task = { id: string; categoryId: string; title: string; completed: boolean; createdAt: number };
export type EventType = { id: string; name: string; color: string; system: boolean };
export type CalendarEvent = { id: string; title: string; typeId: string; date: string; start: string; end: string };
export type Snapshot = { categories: Category[]; tasks: Task[]; types: EventType[]; events: CalendarEvent[] };

export const UNCATEGORIZED = 'uncategorized';
export const OTHER = 'other';
export const INITIAL: Snapshot = {
  categories: [{ id: UNCATEGORIZED, name: 'Без категории', system: true }],
  tasks: [],
  types: [{ id: OTHER, name: 'Другое', color: '#89919d', system: true }],
  events: [],
};

export interface Repository {
  load(): Promise<Snapshot>;
  saveCategory(category: Category): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  saveType(type: EventType): Promise<void>;
  deleteType(id: string): Promise<void>;
  saveEvent(event: CalendarEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  cleanupOldEvents(now: Date): Promise<number>;
}

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
export const TYPE_COLORS = ['#5576d6', '#d18354', '#8c6bc3', '#3c9d8b', '#c45d80', '#8c904b'];

export function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function shiftDate(value: string, days: number): string {
  const d = parseDate(value);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function shiftMonth(value: string, months: number): string {
  const d = parseDate(value);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return localDate(d);
}
export function mondayOf(value: string): string {
  const d = parseDate(value);
  return shiftDate(value, -((d.getDay() + 6) % 7));
}
export function timeMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
export function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
