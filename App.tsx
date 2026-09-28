import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { repository } from './src/repository';
import { CalendarEvent, Category, EventType, INITIAL, OTHER, Repeat, Snapshot, Task, TYPE_COLORS, UNCATEGORIZED, localDate, mondayOf, parseDate, shiftDate, shiftMonth, timeMinutes, uid, validTime } from './src/model';
import { isExpired } from './src/retention';
import { firstConflictDate, monthGridDates, occursOn, validLocalDate } from './src/recurrence';

type Tab = 'tasks' | 'calendar';
type Mode = 'day' | 'three' | 'week' | 'month';
type Dialog = 'task' | 'category' | 'event' | 'types' | 'type' | null;
const C = { ink: '#f2eff8', muted: '#aaa5b8', blue: '#b9a2ff', button: '#7050ae', purple: '#b58aff', pale: '#382f51', line: '#3a3546', bg: '#15141c', white: '#24212e', red: '#ff8598', orange: '#a45124', grid: '#302c39', alt: '#292832' };
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTH_TITLES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const HOUR_HEIGHT = 72;
const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'once', label: 'Единоразово' },
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekly', label: 'Каждую неделю' },
  { value: 'monthly', label: 'Каждый месяц' },
];

function dateTitle(value: string): string { const d = parseDate(value); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function monthTitle(value: string): string { const d = parseDate(value); return `${MONTH_TITLES[d.getMonth()]} ${d.getFullYear()}`; }
function dayName(value: string): string { return WEEKDAYS[(parseDate(value).getDay() + 6) % 7]; }
function shade(hex: string): string { return `${hex}38`; }

function Action({ label, onPress, kind = 'plain', disabled = false, containerStyle, textStyle }: { label: string; onPress: () => void; kind?: 'plain' | 'primary' | 'orange' | 'danger'; disabled?: boolean; containerStyle?: ViewStyle; textStyle?: TextStyle }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.action, kind === 'primary' && styles.actionPrimary, kind === 'orange' && styles.actionOrange, kind === 'danger' && styles.actionDanger, containerStyle, disabled && { opacity: 0.45 }]}>
    <Text style={[styles.actionText, (kind === 'primary' || kind === 'orange') && { color: '#fff' }, kind === 'danger' && { color: C.red }, textStyle]}>{label}</Text>
  </Pressable>;
}

function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress: () => void; color?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected, color && { borderColor: color }]}>
    {color && <View style={[styles.dot, { backgroundColor: color }]} />}
    <Text style={[styles.chipText, selected && { color: C.blue, fontWeight: '700' }]}>{label}</Text>
  </Pressable>;
}

function EventDots({ events, types, max = 3 }: { events: CalendarEvent[]; types: EventType[]; max?: number }) {
  return <View style={styles.dots}>{events.slice(0, max).map(x => <View key={x.id} style={[styles.smallDot, { backgroundColor: types.find(t => t.id === x.typeId)?.color ?? '#89919d' }]} />)}{events.length > max && <Text style={styles.moreDots}>+{events.length - max}</Text>}</View>;
}

export default function App() {
  const [data, setData] = useState<Snapshot>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('tasks');
  const [mode, setMode] = useState<Mode>('day');
  const [selected, setSelected] = useState(localDate(new Date()));
  const [today, setToday] = useState(localDate(new Date()));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [taskDraft, setTaskDraft] = useState<Task | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<Category | null>(null);
  const [eventDraft, setEventDraft] = useState<CalendarEvent | null>(null);
  const [typeDraft, setTypeDraft] = useState<EventType | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [formError, setFormError] = useState('');
  const [cleanupMessage, setCleanupMessage] = useState('');
  const timelineRef = useRef<ScrollView>(null);
  const refresh = useCallback(async () => { setData(await repository.load()); }, []);
  useEffect(() => {
    let mounted = true;
    const checkOldEntries = async (firstRun = false) => {
      try {
        const removed = await repository.cleanupOldEvents(new Date());
        if (mounted) {
          setToday(localDate(new Date()));
          if (firstRun || removed > 0) await refresh();
        }
      } catch (e) { if (mounted) setError(String(e)); }
      finally { if (firstRun && mounted) setLoading(false); }
    };
    void checkOldEntries(true);
    const timer = setInterval(() => { void checkOldEntries(); }, 60 * 60 * 1000);
    const dateTimer = setInterval(() => { if (mounted) setToday(localDate(new Date())); }, 60 * 1000);
    const subscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', state => { if (state === 'active') void checkOldEntries(); });
    return () => { mounted = false; clearInterval(timer); clearInterval(dateTimer); subscription?.remove(); };
  }, [refresh]);
  useEffect(() => {
    if (tab !== 'calendar' || mode === 'month') return;
    const frame = requestAnimationFrame(() => timelineRef.current?.scrollTo({ y: HOUR_HEIGHT * 7, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [tab, mode, selected]);
  const mutate = async (action: () => Promise<void>, after?: () => void) => {
    try { setError(''); await action(); await refresh(); after?.(); } catch (e) { setError(String(e)); }
  };
  const openTask = (task?: Task, categoryId = UNCATEGORIZED) => { setFormError(''); setTaskDraft(task ?? { id: uid(), categoryId, title: '', completed: false, createdAt: Date.now() }); setDialog('task'); };
  const openCategory = (category?: Category) => { setFormError(''); setCategoryDraft(category ?? { id: uid(), name: '', system: false }); setDialog('category'); };
  const openEvent = (event?: CalendarEvent, date = mode === 'three' ? today : selected) => { setFormError(''); setNewTypeName(''); setEventDraft(event ?? { id: uid(), title: '', typeId: OTHER, date, start: '09:00', end: '10:00', repeat: 'once', repeatEnd: null }); setDialog('event'); };
  const openType = (type?: EventType) => { setFormError(''); setTypeDraft(type ?? { id: uid(), name: '', color: TYPE_COLORS[data.types.length % TYPE_COLORS.length], system: false }); setDialog('type'); };
  const typeColor = (id: string) => data.types.find(x => x.id === id)?.color ?? '#89919d';
  const eventsOn = (date: string) => data.events.filter(x => occursOn(x, date)).sort((a, b) => a.start.localeCompare(b.start));
  const move = (direction: number) => setSelected(current => mode === 'month' ? shiftMonth(current, direction) : shiftDate(current, direction * (mode === 'week' ? 7 : 1)));
  const cleanNow = async () => {
    try {
      const removed = await repository.cleanupOldEvents(new Date());
      await refresh();
      setCleanupMessage(removed ? `Удалено записей: ${removed}` : 'Старых записей нет');
    } catch (e) { setError(String(e)); }
  };
  const saveTask = () => {
    if (!taskDraft) return;
    if (!taskDraft.title.trim()) { setFormError('Введите название задачи'); return; }
    mutate(() => repository.saveTask({ ...taskDraft, title: taskDraft.title.trim() }), () => setDialog(null));
  };
  const saveCategory = () => {
    if (!categoryDraft) return;
    if (!categoryDraft.name.trim()) { setFormError('Введите название категории'); return; }
    mutate(() => repository.saveCategory({ ...categoryDraft, name: categoryDraft.name.trim() }), () => setDialog(null));
  };
  const saveType = () => {
    if (!typeDraft) return;
    const name = typeDraft.name.trim();
    if (!name) { setFormError('Введите название типа'); return; }
    if (data.types.some(x => x.id !== typeDraft.id && x.name.toLowerCase() === name.toLowerCase())) { setFormError('Такой тип уже есть'); return; }
    mutate(() => repository.saveType({ ...typeDraft, name }), () => setDialog('types'));
  };
  const saveEvent = async () => {
    if (!eventDraft) return;
    const title = eventDraft.title.trim();
    if (!title) { setFormError('Введите название записи'); return; }
    if (!validLocalDate(eventDraft.date)) { setFormError('Дата должна быть в формате ГГГГ-ММ-ДД'); return; }
    if (eventDraft.repeat !== 'once' && (!eventDraft.repeatEnd || !validLocalDate(eventDraft.repeatEnd) || eventDraft.repeatEnd < eventDraft.date)) { setFormError('Укажите дату окончания не раньше начальной'); return; }
    if (!validTime(eventDraft.start) || !validTime(eventDraft.end) || timeMinutes(eventDraft.end) <= timeMinutes(eventDraft.start)) { setFormError('Укажите время в формате 09:30; конец должен быть позже начала'); return; }
    const conflict = data.events.map(event => ({ event, date: firstConflictDate(eventDraft, event) })).find(x => x.date);
    if (conflict) { setFormError(`В ${conflict.date} это время занято: «${conflict.event.title}»`); return; }
    const wantedType = newTypeName.trim();
    const existingType = data.types.find(x => x.name.toLowerCase() === wantedType.toLowerCase());
    const addedType: EventType | null = wantedType && !existingType ? { id: uid(), name: wantedType, color: TYPE_COLORS[data.types.length % TYPE_COLORS.length], system: false } : null;
    await mutate(async () => {
      if (addedType) await repository.saveType(addedType);
      await repository.saveEvent({ ...eventDraft, title, typeId: addedType?.id ?? existingType?.id ?? eventDraft.typeId });
    }, () => { setSelected(eventDraft.date); setDialog(null); });
  };
  const renderTimeline = (dates: string[]) => {
    const threeDays = dates.length === 3;
    const contentHeight = 24 * HOUR_HEIGHT;
    return <>
      {threeDays && <View style={styles.threeDayHeader}><View style={styles.threeTimeCorner} />{dates.map(date => <View key={date} style={[styles.threeDate, date === today && styles.threeDateToday]}><Text style={[styles.threeDateText, date === today && styles.threeDateTextToday]}>{dayName(date)} · {parseDate(date).getDate()}</Text>{date === today && <View style={styles.todayUnderline} />}</View>)}</View>}
      <ScrollView ref={timelineRef} style={styles.timelineScroll} contentContainerStyle={{ minHeight: contentHeight }}>
      <View style={styles.timelineRow}>
        <View style={[styles.timeRail, threeDays && styles.threeTimeRail, { height: contentHeight }]}>
          {Array.from({ length: 24 }, (_, h) => <Text key={h} style={[styles.timeLabel, { top: h * HOUR_HEIGHT + 3 }]}>{String(h).padStart(2, '0')}:00</Text>)}
        </View>
        <View style={styles.timelineColumns}>
          {dates.map((date, index) => {
            const dayEvents = eventsOn(date);
            return <View key={date} style={[styles.dayColumn, threeDays && { backgroundColor: index % 2 ? C.alt : C.bg }, { height: contentHeight }]}>
              {Array.from({ length: 49 }, (_, i) => <View key={i} style={[styles.gridLine, { top: i * HOUR_HEIGHT / 2, borderTopColor: i % 2 ? C.grid : C.line }]} />)}
              {dayEvents.map(event => {
                const top = timeMinutes(event.start) / 60 * HOUR_HEIGHT;
                const height = Math.max(26, (timeMinutes(event.end) - timeMinutes(event.start)) / 60 * HOUR_HEIGHT - 2);
                const color = typeColor(event.typeId);
                return <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`${event.title}, ${event.start}–${event.end}`} onPress={() => openEvent(event)} style={[styles.eventBlock, { top, height, left: 0, right: 0, backgroundColor: shade(color), borderLeftColor: color }]}>
                  <Text numberOfLines={height < 48 ? 1 : 2} style={styles.eventTitle}>{event.title}</Text>
                  {height >= 45 && <Text style={styles.eventTime}>{event.start}–{event.end}</Text>}
                </Pressable>;
              })}
            </View>;
          })}
        </View>
      </View>
      </ScrollView>
    </>;
  };
  const weekStart = mondayOf(selected);
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
  const monthFirst = `${selected.slice(0, 7)}-01`;
  const monthDates = monthGridDates(monthFirst);
  const selectedEvents = eventsOn(selected);
  const expiredCount = data.events.filter(event => isExpired(event, new Date())).length;

  return <SafeAreaProvider><SafeAreaView style={styles.root} edges={['top', 'bottom']}>
    <StatusBar barStyle="light-content" backgroundColor={C.bg} />
    <View style={styles.header}>
      <View><Text style={styles.eyebrow}>МОЙ ДЕНЬ</Text><Text style={styles.headerTitle}>{tab === 'tasks' ? 'Задачи' : 'Календарь'}</Text></View>
      {tab === 'calendar' && mode !== 'three' && <Pressable onPress={() => setSelected(localDate(new Date()))} style={styles.todayButton}><Text style={styles.todayText}>Сегодня</Text></Pressable>}
    </View>
    {Platform.OS === 'web' && <Text style={styles.demoBanner}>Веб-макет · вымышленные данные · изменения только до обновления страницы</Text>}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {loading ? <View style={styles.loading}><ActivityIndicator color={C.blue} /><Text style={styles.muted}>Открываем календарь…</Text></View> : tab === 'tasks' ? <View style={styles.screenBody}>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.sectionTop}><Text style={styles.sectionHeading}>Мои категории</Text><Action label="+ Категория" onPress={() => openCategory()} /></View>
        {data.categories.map(category => {
          const tasks = data.tasks.filter(x => x.categoryId === category.id).sort((a, b) => Number(a.completed) - Number(b.completed) || a.createdAt - b.createdAt);
          return <View key={category.id} style={styles.card}>
            <View style={styles.categoryHeader}><View style={{ flex: 1 }}><Text style={styles.categoryName}>{category.name}</Text><Text style={styles.caption}>{tasks.filter(x => !x.completed).length} осталось · {tasks.length} всего</Text></View>
              {!category.system && <Pressable accessibilityLabel={`Изменить категорию ${category.name}`} onPress={() => openCategory(category)} style={styles.iconButton}><Text style={styles.iconText}>⋯</Text></Pressable>}
              <Pressable accessibilityLabel={`Добавить задачу в ${category.name}`} onPress={() => openTask(undefined, category.id)} style={styles.plusMini}><Text style={styles.plusMiniText}>+</Text></Pressable>
            </View>
            {tasks.length === 0 ? <Text style={styles.emptySmall}>Пока нет задач</Text> : tasks.map(task => <View key={task.id} style={styles.taskRow}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: task.completed }} accessibilityLabel={`${task.completed ? 'Возобновить' : 'Завершить'}: ${task.title}`} onPress={() => mutate(() => repository.saveTask({ ...task, completed: !task.completed }))} style={[styles.check, task.completed && styles.checkDone]}><Text style={styles.checkMark}>{task.completed ? '✓' : ''}</Text></Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => openTask(task)}><Text style={[styles.taskText, task.completed && styles.taskDone]}>{task.title}</Text></Pressable>
              <Pressable accessibilityLabel={`Редактировать ${task.title}`} onPress={() => openTask(task)} style={styles.editTouch}><Text style={styles.editGlyph}>›</Text></Pressable>
            </View>)}
          </View>;
        })}
        <Text style={styles.footerNote}>Задачи существуют отдельно от записей календаря.</Text>
      </ScrollView>
      <Pressable onPress={() => openTask()} accessibilityRole="button" accessibilityLabel="Добавить задачу" style={styles.fab}><Text style={styles.fabText}>+</Text></Pressable>
    </View> : <>
      <View style={styles.calendarControls}>
        {mode !== 'three' && <View style={styles.dateNavigator}><Pressable accessibilityLabel="Предыдущая дата" onPress={() => move(-1)} style={styles.navArrow}><Text style={styles.navArrowText}>←</Text></Pressable><Text style={styles.dateHeading}>{mode === 'month' ? monthTitle(selected) : dateTitle(selected)}</Text><Pressable accessibilityLabel="Следующая дата" onPress={() => move(1)} style={styles.navArrow}><Text style={styles.navArrowText}>→</Text></Pressable></View>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>{([['day', 'День'], ['three', '3 дня'], ['week', 'Неделя'], ['month', 'Месяц']] as const).map(([value, label]) => <Chip key={value} label={label} selected={mode === value} onPress={() => setMode(value)} />)}</ScrollView>
      </View>
      {mode === 'day' && renderTimeline([selected])}
      {mode === 'three' && renderTimeline(Array.from({ length: 3 }, (_, i) => shiftDate(today, i)))}
      {mode === 'week' && <><View style={styles.weekStrip}>{weekDates.map(date => <Pressable key={date} onPress={() => setSelected(date)} style={[styles.weekDate, selected === date && styles.weekSelected, date === today && styles.weekToday]}><Text style={[styles.weekDay, selected === date && styles.selectedText]}>{dayName(date)}</Text><Text style={[styles.weekNumber, selected === date && styles.selectedText]}>{parseDate(date).getDate()}</Text><EventDots events={eventsOn(date)} types={data.types} max={2} /></Pressable>)}</View>{renderTimeline([selected])}</>}
      {mode === 'month' && <ScrollView style={styles.body} contentContainerStyle={styles.monthBody}>
        <View style={styles.monthCard}><View style={styles.monthWeekdays}>{WEEKDAYS.map(x => <Text key={x} style={styles.monthWeekday}>{x}</Text>)}</View><View style={styles.monthGrid}>{monthDates.map(date => { const outside = date.slice(0, 7) !== selected.slice(0, 7); return <Pressable key={date} onPress={() => setSelected(date)} style={[styles.monthCell, date === selected && styles.monthCellSelected]}><View style={[styles.monthDateCircle, date === today && styles.monthTodayCircle]}><Text style={[styles.monthNum, outside && styles.outsideMonth, date === selected && { color: C.blue, fontWeight: '800' }]}>{parseDate(date).getDate()}</Text></View><EventDots events={eventsOn(date)} types={data.types} max={2} /></Pressable>; })}</View></View>
        <View style={styles.agendaHeader}><Text style={styles.sectionHeading}>{dateTitle(selected)}</Text><Action label="+ Запись" onPress={() => openEvent()} /></View>
        {selectedEvents.length ? selectedEvents.map(event => <Pressable key={event.id} style={styles.agendaItem} onPress={() => openEvent(event)}><View style={[styles.agendaBar, { backgroundColor: typeColor(event.typeId) }]} /><Text style={styles.agendaTime}>{event.start}</Text><View style={{ flex: 1 }}><Text style={styles.agendaTitle}>{event.title}</Text><Text style={styles.caption}>{event.start}–{event.end} · {data.types.find(x => x.id === event.typeId)?.name}</Text></View><Text style={styles.editGlyph}>›</Text></Pressable>) : <Text style={styles.emptySmall}>На этот день записей нет</Text>}
      </ScrollView>}
      <View style={styles.calendarBottomActions}><Action label="Типы записей" kind="orange" containerStyle={styles.footerAction} textStyle={styles.footerActionText} onPress={() => { setCleanupMessage(''); setDialog('types'); }} /><Action label="+ Запись" kind="primary" containerStyle={styles.footerAction} textStyle={styles.footerActionText} onPress={() => openEvent()} /></View>
    </>}
    <View style={styles.tabBar}><Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'tasks' }} onPress={() => setTab('tasks')} style={[styles.tab, tab === 'tasks' && styles.activeTab]}><Text style={[styles.tabIcon, tab === 'tasks' && styles.activeTabText]}>☑</Text><Text style={[styles.tabText, tab === 'tasks' && styles.activeTabText]}>Задачи</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'calendar' }} onPress={() => setTab('calendar')} style={[styles.tab, tab === 'calendar' && styles.activeTab]}><Text style={[styles.tabIcon, tab === 'calendar' && styles.activeTabText]}>▦</Text><Text style={[styles.tabText, tab === 'calendar' && styles.activeTabText]}>Календарь</Text></Pressable></View>

    <Modal visible={dialog !== null} transparent animationType="slide" onRequestClose={() => setDialog(null)}><KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}><View style={styles.sheet}><View style={styles.sheetTop}><Text style={styles.sheetTitle}>{dialog === 'task' ? taskDraft?.title ? 'Задача' : 'Новая задача' : dialog === 'category' ? categoryDraft?.name ? 'Категория' : 'Новая категория' : dialog === 'event' ? eventDraft?.title ? 'Запись' : 'Новая запись' : dialog === 'types' ? 'Типы записей' : 'Тип записи'}</Text><Pressable accessibilityLabel="Закрыть" onPress={() => setDialog(null)} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={styles.sheetContent}>
        {dialog === 'task' && taskDraft && <><Text style={styles.fieldLabel}>Название</Text><TextInput value={taskDraft.title} onChangeText={title => setTaskDraft({ ...taskDraft, title })} placeholder="Что нужно сделать?" style={styles.input} autoFocus /><Text style={styles.fieldLabel}>Категория</Text><View style={styles.wrap}>{data.categories.map(x => <Chip key={x.id} label={x.name} selected={taskDraft.categoryId === x.id} onPress={() => setTaskDraft({ ...taskDraft, categoryId: x.id })} />)}</View><Action label="Сохранить задачу" kind="primary" onPress={saveTask} />{data.tasks.some(x => x.id === taskDraft.id) && <Action label="Удалить задачу" kind="danger" onPress={() => mutate(() => repository.deleteTask(taskDraft.id), () => setDialog(null))} />}</>}
        {dialog === 'category' && categoryDraft && <><Text style={styles.fieldLabel}>Название категории</Text><TextInput value={categoryDraft.name} onChangeText={name => setCategoryDraft({ ...categoryDraft, name })} placeholder="Например, Учёба" style={styles.input} autoFocus /><Action label="Сохранить категорию" kind="primary" onPress={saveCategory} />{data.categories.some(x => x.id === categoryDraft.id) && <><Text style={styles.helpText}>При удалении задачи перейдут в «Без категории».</Text><Action label="Удалить категорию" kind="danger" onPress={() => mutate(() => repository.deleteCategory(categoryDraft.id), () => setDialog(null))} /></>}</>}
        {dialog === 'event' && eventDraft && <>
          <Text style={styles.fieldLabel}>Название</Text>
          <TextInput value={eventDraft.title} onChangeText={title => setEventDraft({ ...eventDraft, title })} placeholder="Что запланировано?" placeholderTextColor={C.muted} style={styles.input} autoFocus />
          <Text style={styles.fieldLabel}>Тип записи</Text>
          <View style={styles.wrap}>{data.types.map(x => <Chip key={x.id} label={x.name} color={x.color} selected={eventDraft.typeId === x.id && !newTypeName} onPress={() => { setNewTypeName(''); setEventDraft({ ...eventDraft, typeId: x.id }); }} />)}</View>
          <TextInput value={newTypeName} onChangeText={setNewTypeName} placeholder="Или новый тип" placeholderTextColor={C.muted} style={styles.input} />
          <Text style={styles.fieldLabel}>Периодичность</Text>
          <View style={styles.wrap}>{REPEAT_OPTIONS.map(option => <Chip key={option.value} label={option.label} selected={eventDraft.repeat === option.value} onPress={() => setEventDraft({ ...eventDraft, repeat: option.value, date: eventDraft.repeat === 'once' && option.value !== 'once' ? today : eventDraft.date, repeatEnd: option.value === 'once' ? null : eventDraft.repeatEnd })} />)}</View>
          <Text style={styles.fieldLabel}>{eventDraft.repeat === 'once' ? 'Дата (ГГГГ-ММ-ДД)' : 'Начальная дата периода (ГГГГ-ММ-ДД)'}</Text>
          <TextInput value={eventDraft.date} onChangeText={date => setEventDraft({ ...eventDraft, date })} placeholder="2026-09-28" placeholderTextColor={C.muted} style={styles.input} keyboardType="numbers-and-punctuation" />
          {eventDraft.repeat !== 'once' && <><Text style={styles.fieldLabel}>Конечная дата периода (ГГГГ-ММ-ДД)</Text><TextInput value={eventDraft.repeatEnd ?? ''} onChangeText={repeatEnd => setEventDraft({ ...eventDraft, repeatEnd })} placeholder="Введите дату вручную" placeholderTextColor={C.muted} style={styles.input} keyboardType="numbers-and-punctuation" /><Text style={styles.helpText}>При редактировании изменяется вся серия. Ежемесячный повтор в коротком месяце переносится на его последний день.</Text></>}
          <View style={styles.timeFields}><View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Начало</Text><TextInput value={eventDraft.start} onChangeText={start => setEventDraft({ ...eventDraft, start })} placeholder="09:00" placeholderTextColor={C.muted} style={styles.input} keyboardType="numbers-and-punctuation" /></View><View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Окончание</Text><TextInput value={eventDraft.end} onChangeText={end => setEventDraft({ ...eventDraft, end })} placeholder="10:00" placeholderTextColor={C.muted} style={styles.input} keyboardType="numbers-and-punctuation" /></View></View>
          <Action label="Сохранить запись" kind="primary" onPress={saveEvent} />
          {data.events.some(x => x.id === eventDraft.id) && <Action label={eventDraft.repeat === 'once' ? 'Удалить запись' : 'Удалить всю серию'} kind="danger" onPress={() => mutate(() => repository.deleteEvent(eventDraft.id), () => setDialog(null))} />}
        </>}
        {dialog === 'types' && <><Text style={styles.helpText}>Цвет помогает различать записи. «Другое» всегда остаётся доступным.</Text>{data.types.map(type => <View key={type.id} style={styles.typeRow}><View style={[styles.typeColor, { backgroundColor: type.color }]} /><Text style={[styles.taskText, { flex: 1 }]}>{type.name}</Text>{!type.system && <Action label="Изменить" onPress={() => openType(type)} />}</View>)}<Action label="+ Новый тип" kind="primary" onPress={() => openType()} /><Text style={styles.fieldLabel}>Очистка календаря</Text><Text style={styles.helpText}>Записи, начавшиеся более месяца назад, удаляются автоматически при открытии приложения, возвращении к нему и каждый час. Задачи не затрагиваются.</Text><Action label={`Очистить старые записи${expiredCount ? ` · ${expiredCount}` : ''}`} kind="danger" onPress={() => { void cleanNow(); }} />{!!cleanupMessage && <Text style={styles.helpText}>{cleanupMessage}</Text>}</>}
        {dialog === 'type' && typeDraft && <><Text style={styles.fieldLabel}>Название типа</Text><TextInput value={typeDraft.name} onChangeText={name => setTypeDraft({ ...typeDraft, name })} style={styles.input} placeholder="Например, Спорт" autoFocus /><Text style={styles.fieldLabel}>Цвет</Text><View style={styles.wrap}>{TYPE_COLORS.map(color => <Pressable key={color} accessibilityLabel={`Цвет ${color}`} onPress={() => setTypeDraft({ ...typeDraft, color })} style={[styles.colorChoice, { backgroundColor: color }, typeDraft.color === color && styles.colorSelected]} />)}</View><Action label="Сохранить тип" kind="primary" onPress={saveType} />{data.types.some(x => x.id === typeDraft.id) && !typeDraft.system && <><Text style={styles.helpText}>При удалении записи перейдут в «Другое».</Text><Action label="Удалить тип" kind="danger" onPress={() => mutate(() => repository.deleteType(typeDraft.id), () => setDialog('types'))} /></>}</>}
        {!!formError && <Text style={styles.error}>{formError}</Text>}
      </ScrollView>
    </View></KeyboardAvoidingView></Modal>
  </SafeAreaView></SafeAreaProvider>;
}

const layoutStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, header: { paddingHorizontal: 22, paddingTop: Platform.OS === 'web' ? 18 : 12, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2.4, color: C.blue, marginBottom: 3 }, headerTitle: { fontSize: 30, fontWeight: '800', color: C.ink, letterSpacing: -0.7 }, todayButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 17, backgroundColor: C.white, borderWidth: 1, borderColor: C.line }, todayText: { color: C.blue, fontWeight: '700' }, demoBanner: { backgroundColor: '#fff3df', color: '#755a2c', paddingHorizontal: 18, paddingVertical: 7, fontSize: 11 }, error: { color: C.red, padding: 10, fontSize: 13 }, muted: { color: C.muted, marginTop: 10 }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1 }, bodyContent: { paddingHorizontal: 16, paddingBottom: 100 }, sectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, sectionHeading: { fontSize: 17, fontWeight: '800', color: C.ink }, action: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, minHeight: 38, justifyContent: 'center' }, actionPrimary: { backgroundColor: C.blue, marginTop: 12, alignSelf: 'stretch', alignItems: 'center' }, actionDanger: { backgroundColor: '#fff0f1', marginTop: 12, alignSelf: 'stretch', alignItems: 'center' }, actionText: { color: C.blue, fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: C.white, borderRadius: 20, marginBottom: 13, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: C.line }, categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 }, categoryName: { fontSize: 18, fontWeight: '800', color: C.ink }, caption: { fontSize: 12, color: C.muted, marginTop: 3 }, iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, iconText: { fontSize: 25, color: C.muted, marginTop: -12 }, plusMini: { width: 37, height: 37, borderRadius: 13, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' }, plusMiniText: { fontSize: 24, color: C.blue, marginTop: -3 }, emptySmall: { color: C.muted, paddingVertical: 18, fontSize: 13 }, taskRow: { flexDirection: 'row', alignItems: 'center', minHeight: 51, borderTopWidth: 1, borderColor: '#f2f3f6', gap: 12 }, check: { width: 24, height: 24, borderRadius: 9, borderWidth: 2, borderColor: '#aab5c7', alignItems: 'center', justifyContent: 'center' }, checkDone: { backgroundColor: C.blue, borderColor: C.blue }, checkMark: { color: 'white', fontSize: 15, fontWeight: '900' }, taskText: { fontSize: 15, color: C.ink, lineHeight: 21 }, taskDone: { textDecorationLine: 'line-through', color: '#a1a8b3' }, editTouch: { width: 30, alignItems: 'center' }, editGlyph: { color: '#b3bac7', fontSize: 27, fontWeight: '300' }, footerNote: { textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 14 }, fab: { position: 'absolute', right: 22, bottom: 83, width: 55, height: 55, borderRadius: 20, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: C.blue, shadowOpacity: 0.25, shadowRadius: 8 }, fabText: { color: 'white', fontSize: 31, marginTop: -4 },
  tabBar: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, paddingBottom: Platform.OS === 'web' ? 8 : 4, paddingTop: 5 }, tab: { flex: 1, alignItems: 'center', paddingVertical: 5 }, activeTab: {}, tabIcon: { fontSize: 22, color: C.muted }, tabText: { fontSize: 11, color: C.muted, fontWeight: '700', marginTop: 2 }, activeTabText: { color: C.blue },
  calendarControls: { paddingHorizontal: 16, paddingBottom: 9 }, dateNavigator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, navArrow: { width: 42, height: 38, borderRadius: 13, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }, navArrowText: { fontSize: 29, lineHeight: 32, color: C.blue }, dateHeading: { fontSize: 18, fontWeight: '800', color: C.ink }, modeRow: { gap: 7 }, chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: C.white, borderColor: C.line, borderWidth: 1, minHeight: 36 }, chipSelected: { backgroundColor: C.pale, borderColor: '#ccd5f7' }, chipText: { fontSize: 13, color: C.ink }, dot: { width: 8, height: 8, borderRadius: 4 },
  timelineScroll: { flex: 1, backgroundColor: C.white }, timelineRow: { flexDirection: 'row' }, timeRail: { width: 56, backgroundColor: C.white }, timeLabel: { position: 'absolute', right: 7, color: '#8792a3', fontSize: 10 }, dayColumn: { backgroundColor: C.white, borderLeftWidth: 1, borderLeftColor: C.line }, columnHeader: { height: 46, paddingHorizontal: 8, justifyContent: 'center', backgroundColor: '#fafbfe' }, columnHeaderSelected: { backgroundColor: C.pale }, columnDate: { fontSize: 12, fontWeight: '800', color: C.ink }, gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1 }, eventBlock: { position: 'absolute', borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 5, paddingTop: 3, overflow: 'hidden' }, eventTitle: { color: C.ink, fontSize: 11, fontWeight: '800', lineHeight: 14 }, eventTime: { color: '#596477', fontSize: 10, marginTop: 1 },
  weekStrip: { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 7, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line }, weekDate: { flex: 1, alignItems: 'center', minHeight: 65, borderRadius: 13, paddingTop: 4 }, weekSelected: { backgroundColor: C.blue }, weekDay: { color: C.muted, fontSize: 10 }, weekNumber: { color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 2 }, selectedText: { color: 'white' }, dots: { flexDirection: 'row', gap: 2, alignItems: 'center', minHeight: 12, marginTop: 3, justifyContent: 'center' }, smallDot: { width: 5, height: 5, borderRadius: 3 }, moreDots: { fontSize: 8, color: C.muted, fontWeight: '700' },
  monthBody: { paddingHorizontal: 13, paddingBottom: 40 }, variantBar: { marginBottom: 10, gap: 6 }, monthCard: { backgroundColor: C.white, borderRadius: 19, borderWidth: 1, borderColor: C.line, padding: 8 }, monthWeekdays: { flexDirection: 'row' }, monthWeekday: { flex: 1, textAlign: 'center', fontSize: 11, color: C.muted, fontWeight: '700', paddingVertical: 8 }, monthGrid: { flexDirection: 'row', flexWrap: 'wrap' }, monthCell: { width: '14.2857%', height: 59, alignItems: 'center', paddingTop: 7, borderTopWidth: 1, borderTopColor: '#f3f4f7' }, monthCellSelected: { backgroundColor: C.pale, borderRadius: 11 }, monthNum: { color: C.ink, fontWeight: '600', fontSize: 13 }, outsideMonth: { color: '#c2c9d3' }, monthWeekGroup: { borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 5 }, weekGroupLabel: { color: C.muted, fontSize: 11, paddingLeft: 8, paddingTop: 3 }, stripDate: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 12 }, stripSelected: { backgroundColor: C.blue }, stripNumber: { color: C.ink, fontSize: 14, fontWeight: '700' }, agendaHeader: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, agendaItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 13, padding: 11, marginTop: 8 }, agendaBar: { width: 3, height: 36, borderRadius: 3 }, agendaTime: { color: C.ink, fontSize: 13, fontWeight: '800', width: 42 }, agendaTitle: { color: C.ink, fontSize: 14, fontWeight: '700' }, calendarBottomActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.white, borderTopWidth: 1, borderColor: C.line, paddingHorizontal: 15, paddingVertical: 5 },
  modalBackdrop: { flex: 1, backgroundColor: '#1c29406b', justifyContent: 'flex-end' }, sheet: { maxHeight: '90%', minHeight: 210, backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 20 }, sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 17, paddingBottom: 7 }, sheetTitle: { color: C.ink, fontSize: 20, fontWeight: '800' }, close: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center' }, closeText: { color: C.muted, fontSize: 29 }, sheetContent: { paddingHorizontal: 20, paddingBottom: 25 }, fieldLabel: { color: C.ink, fontSize: 12, fontWeight: '800', marginTop: 17, marginBottom: 7 }, input: { borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: C.ink, minHeight: 45 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, helpText: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 13 }, timeFields: { flexDirection: 'row', gap: 10 }, typeRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderColor: C.line, minHeight: 54 }, typeColor: { width: 13, height: 13, borderRadius: 5 }, colorChoice: { width: 35, height: 35, borderRadius: 12 }, colorSelected: { borderWidth: 3, borderColor: C.ink },
});

const styles = {
  ...layoutStyles,
  ...StyleSheet.create({
    screenBody: { flex: 1 },
    demoBanner: { backgroundColor: '#302536', color: '#e4bad5', paddingHorizontal: 18, paddingVertical: 7, fontSize: 11 },
    actionPrimary: { backgroundColor: C.button, marginTop: 12, alignSelf: 'stretch', alignItems: 'center' },
    actionOrange: { backgroundColor: C.orange, marginTop: 12, alignSelf: 'stretch', alignItems: 'center' },
    actionDanger: { backgroundColor: '#432b39', marginTop: 12, alignSelf: 'stretch', alignItems: 'center' },
    taskRow: { flexDirection: 'row', alignItems: 'center', minHeight: 51, borderTopWidth: 1, borderColor: C.grid, gap: 12 },
    check: { width: 24, height: 24, borderRadius: 9, borderWidth: 2, borderColor: '#8f899d', alignItems: 'center', justifyContent: 'center' },
    checkDone: { backgroundColor: C.button, borderColor: C.button },
    taskDone: { textDecorationLine: 'line-through', color: '#898494' },
    fab: { position: 'absolute', right: 22, bottom: 16, width: 55, height: 55, borderRadius: 20, backgroundColor: C.button, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10 },
    chipSelected: { backgroundColor: C.pale, borderColor: C.purple },
    navArrowText: { fontSize: 21, lineHeight: 26, color: C.blue, textAlign: 'center', includeFontPadding: false },
    timelineScroll: { flex: 1, backgroundColor: C.bg },
    timelineColumns: { flex: 1, flexDirection: 'row' },
    timeRail: { width: 56, backgroundColor: C.bg },
    threeTimeRail: { width: 48 },
    timeLabel: { position: 'absolute', right: 5, color: C.muted, fontSize: 10 },
    dayColumn: { flex: 1, backgroundColor: C.bg, borderLeftWidth: 1, borderLeftColor: C.line },
    eventTime: { color: '#d4cfe0', fontSize: 10, marginTop: 1 },
    threeDayHeader: { flexDirection: 'row', minHeight: 46, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
    threeTimeCorner: { width: 48, borderRightWidth: 1, borderRightColor: C.line },
    threeDate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderLeftWidth: 1, borderLeftColor: C.line },
    threeDateToday: { backgroundColor: C.pale },
    threeDateText: { color: C.ink, fontSize: 12, fontWeight: '800' },
    threeDateTextToday: { color: C.purple },
    todayUnderline: { width: 28, height: 3, marginTop: 3, borderRadius: 2, backgroundColor: C.purple },
    weekSelected: { backgroundColor: C.button },
    weekToday: { borderWidth: 2, borderColor: C.purple },
    monthCell: { width: '14.2857%', height: 59, alignItems: 'center', paddingTop: 5, borderTopWidth: 1, borderTopColor: C.line },
    monthDateCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    monthTodayCircle: { borderWidth: 2, borderColor: C.purple, backgroundColor: '#453254' },
    outsideMonth: { color: '#777184' },
    moreDots: { fontSize: 8, color: C.ink, fontWeight: '700' },
    calendarBottomActions: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: C.white, borderTopWidth: 1, borderColor: C.line, paddingHorizontal: 15, paddingVertical: 9 },
    footerAction: { flex: 1, height: 45, marginTop: 0, alignSelf: 'auto', alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
    footerActionText: { fontSize: 16, fontWeight: '400', letterSpacing: 0.1 },
    modalBackdrop: { flex: 1, backgroundColor: '#05040bc0', justifyContent: 'flex-end' },
    input: { borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: C.ink, minHeight: 45 },
  }),
};
