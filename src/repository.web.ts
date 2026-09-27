import { CalendarEvent, Category, EventType, INITIAL, Repository, Snapshot, Task, OTHER, UNCATEGORIZED, localDate, shiftDate } from './model';

// The public preview is deliberately session-only and never reads Android data.
const today = localDate(new Date());
let data: Snapshot = {
  categories: [...INITIAL.categories, { id: 'demo-work', name: 'Работа', system: false }, { id: 'demo-personal', name: 'Личное', system: false }],
  tasks: [
    { id: 'demo-task-1', categoryId: 'demo-work', title: 'Обсудить макет календаря', completed: false, createdAt: 1 },
    { id: 'demo-task-2', categoryId: 'demo-work', title: 'Подготовить заметки к встрече', completed: true, createdAt: 2 },
    { id: 'demo-task-3', categoryId: 'demo-personal', title: 'Прочитать книгу', completed: false, createdAt: 3 },
  ],
  types: [...INITIAL.types, { id: 'demo-meeting', name: 'Встреча', color: '#5576d6', system: false }, { id: 'demo-personal-type', name: 'Личное', color: '#3c9d8b', system: false }],
  events: [
    { id: 'demo-event-1', title: 'Планирование недели', typeId: 'demo-meeting', date: today, start: '09:30', end: '10:45' },
    { id: 'demo-event-2', title: 'Прогулка', typeId: 'demo-personal-type', date: today, start: '13:15', end: '14:00' },
    { id: 'demo-event-3', title: 'Созвон по проекту', typeId: 'demo-meeting', date: today, start: '10:00', end: '11:00' },
    { id: 'demo-event-4', title: 'Кофе с другом', typeId: 'demo-personal-type', date: shiftDate(today, 1), start: '16:30', end: '17:30' },
  ],
};
const clone = (): Snapshot => JSON.parse(JSON.stringify(data));
export const repository: Repository = {
  async load() { return clone(); },
  async saveCategory(category: Category) { data.categories = [...data.categories.filter(x => x.id !== category.id), category]; },
  async deleteCategory(id: string) {
    if (id === UNCATEGORIZED) return;
    data.tasks = data.tasks.map(x => x.categoryId === id ? { ...x, categoryId: UNCATEGORIZED } : x);
    data.categories = data.categories.filter(x => x.id !== id);
  },
  async saveTask(task: Task) { data.tasks = [...data.tasks.filter(x => x.id !== task.id), task]; },
  async deleteTask(id: string) { data.tasks = data.tasks.filter(x => x.id !== id); },
  async saveType(type: EventType) { data.types = [...data.types.filter(x => x.id !== type.id), type]; },
  async deleteType(id: string) {
    if (id === OTHER) return;
    data.events = data.events.map(x => x.typeId === id ? { ...x, typeId: OTHER } : x);
    data.types = data.types.filter(x => x.id !== id);
  },
  async saveEvent(event: CalendarEvent) { data.events = [...data.events.filter(x => x.id !== event.id), event]; },
  async deleteEvent(id: string) { data.events = data.events.filter(x => x.id !== id); },
};
