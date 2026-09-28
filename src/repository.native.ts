import * as SQLite from 'expo-sqlite';
import { CalendarEvent, Category, EventType, Repository, Snapshot, Task, OTHER, UNCATEGORIZED } from './model';
import { retentionCutoff } from './retention';

let connection: Promise<SQLite.SQLiteDatabase> | undefined;
async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!connection) connection = initialize();
  return connection;
}
async function initialize(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync('my-day.db');
  await database.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) {
    await database.withExclusiveTransactionAsync(async tx => {
      await tx.execAsync(`
        CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, system INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS event_types (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL COLLATE NOCASE UNIQUE, color TEXT NOT NULL, system INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, type_id TEXT NOT NULL REFERENCES event_types(id), date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS tasks_category_idx ON tasks(category_id, completed, created_at);
        CREATE INDEX IF NOT EXISTS events_date_idx ON calendar_events(date, start_time);
      `);
      await tx.runAsync('INSERT OR IGNORE INTO categories (id, name, system) VALUES (?, ?, 1)', UNCATEGORIZED, 'Без категории');
      await tx.runAsync('INSERT OR IGNORE INTO event_types (id, name, color, system) VALUES (?, ?, ?, 1)', OTHER, 'Другое', '#89919d');
      await tx.execAsync('PRAGMA user_version = 1');
    });
  }
  if (version < 2) {
    await database.withExclusiveTransactionAsync(async tx => {
      await tx.execAsync("ALTER TABLE calendar_events ADD COLUMN repeat TEXT NOT NULL DEFAULT 'once'; ALTER TABLE calendar_events ADD COLUMN repeat_end TEXT; PRAGMA user_version = 2;");
    });
  }
  return database;
}

type CategoryRow = { id: string; name: string; system: number };
type TaskRow = { id: string; category_id: string; title: string; completed: number; created_at: number };
type TypeRow = { id: string; name: string; color: string; system: number };
type EventRow = { id: string; title: string; type_id: string; date: string; start_time: string; end_time: string; repeat: CalendarEvent['repeat']; repeat_end: string | null };
export const repository: Repository = {
  async load(): Promise<Snapshot> {
    const database = await db();
    const [categories, tasks, types, events] = await Promise.all([
      database.getAllAsync<CategoryRow>('SELECT * FROM categories ORDER BY system DESC, name COLLATE NOCASE'),
      database.getAllAsync<TaskRow>('SELECT * FROM tasks ORDER BY completed, created_at'),
      database.getAllAsync<TypeRow>('SELECT * FROM event_types ORDER BY system DESC, name COLLATE NOCASE'),
      database.getAllAsync<EventRow>('SELECT * FROM calendar_events ORDER BY date, start_time'),
    ]);
    return {
      categories: categories.map(x => ({ id: x.id, name: x.name, system: !!x.system })),
      tasks: tasks.map(x => ({ id: x.id, categoryId: x.category_id, title: x.title, completed: !!x.completed, createdAt: x.created_at })),
      types: types.map(x => ({ id: x.id, name: x.name, color: x.color, system: !!x.system })),
      events: events.map(x => ({ id: x.id, title: x.title, typeId: x.type_id, date: x.date, start: x.start_time, end: x.end_time, repeat: x.repeat || 'once', repeatEnd: x.repeat_end })),
    };
  },
  async saveCategory(x: Category) { await (await db()).runAsync('INSERT INTO categories (id, name, system) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name', x.id, x.name, Number(x.system)); },
  async deleteCategory(id: string) {
    if (id === UNCATEGORIZED) return;
    await (await db()).withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('UPDATE tasks SET category_id=? WHERE category_id=?', UNCATEGORIZED, id);
      await tx.runAsync('DELETE FROM categories WHERE id=? AND system=0', id);
    });
  },
  async saveTask(x: Task) { await (await db()).runAsync('INSERT INTO tasks (id, category_id, title, completed, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id, title=excluded.title, completed=excluded.completed', x.id, x.categoryId, x.title, Number(x.completed), x.createdAt); },
  async deleteTask(id: string) { await (await db()).runAsync('DELETE FROM tasks WHERE id=?', id); },
  async saveType(x: EventType) { await (await db()).runAsync('INSERT INTO event_types (id, name, color, system) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color', x.id, x.name, x.color, Number(x.system)); },
  async deleteType(id: string) {
    if (id === OTHER) return;
    await (await db()).withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('UPDATE calendar_events SET type_id=? WHERE type_id=?', OTHER, id);
      await tx.runAsync('DELETE FROM event_types WHERE id=? AND system=0', id);
    });
  },
  async saveEvent(x: CalendarEvent) { await (await db()).runAsync('INSERT INTO calendar_events (id, title, type_id, date, start_time, end_time, repeat, repeat_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, type_id=excluded.type_id, date=excluded.date, start_time=excluded.start_time, end_time=excluded.end_time, repeat=excluded.repeat, repeat_end=excluded.repeat_end', x.id, x.title, x.typeId, x.date, x.start, x.end, x.repeat, x.repeatEnd); },
  async deleteEvent(id: string) { await (await db()).runAsync('DELETE FROM calendar_events WHERE id=?', id); },
  async cleanupOldEvents(now: Date) {
    const cutoff = retentionCutoff(now);
    const result = await (await db()).runAsync(
      `DELETE FROM calendar_events WHERE COALESCE(repeat_end, date) < ? OR (COALESCE(repeat_end, date) = ? AND start_time ${cutoff.includeMinute ? '<=' : '<'} ?)`,
      cutoff.date, cutoff.date, cutoff.time,
    );
    return result.changes;
  },
};
