import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Repeat as RepeatIcon, Settings2, X } from 'lucide-react';
import type { CalendarEvent, Task } from '@/types';
import { EVENT_COLORS } from '@/types';
import {
  addCalendar, calendarOf, calendarsOf, editCalendar, removeCalendar, setSecondaryTz, setShowTasksOnCalendar, setShowWeekNumbers, setWeekStart, setWorkingHours, usePrefs,
} from '@/lib/prefs';
import {
  addDays, allTimeZones, dateKey, expandAll, localTz, shortTime, startOfDay, startOfWeek, type Occurrence,
} from '@/lib/calendar';
import { isMailDrag, readMailDrag } from '@/lib/dnd';

export type CalendarMode = 'day' | 'workweek' | 'week' | 'month' | 'agenda';

interface CalendarViewProps {
  events: CalendarEvent[];
  /** Events from internet calendars. Read-only. */
  subscribed?: CalendarEvent[];
  tasks: Task[];
  /** The bottom edge of an event was dragged. */
  onResizeOccurrence: (occ: { event: CalendarEvent; start: Date }, newEnd: Date) => void;
  sources: React.ReactNode;
  /** Start (and end, when dragged out) as ISO strings. */
  onCreate: (startISO: string, endISO?: string, allDay?: boolean) => void;
  onOpenEvent: (event: CalendarEvent, occurrenceStart: Date) => void;
  onToggleTask: (task: Task) => void;
  /** A task dropped on the grid becomes a time-blocked event. */
  onTaskToCalendar: (task: Task, start: Date) => void;
  /** An event dragged to another time or day. */
  onMoveOccurrence: (occ: { event: CalendarEvent; start: Date }, newStart: Date) => void;
  /** An email dropped on the grid becomes an event. */
  onMailToCalendar: (emailId: string, start: Date) => void;
}

const HOUR_H = 52;
const OCC_MIME = 'application/x-typhoon-occurrence';
const TASK_MIME = 'application/x-typhoon-task';
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MODES: { id: CalendarMode; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'workweek', label: 'Work week' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'agenda', label: 'Agenda' },
];

/** Overlapping events share the width of the column. */
function lanes(occs: Occurrence[]): Map<string, { lane: number; of: number }> {
  const out = new Map<string, { lane: number; of: number }>();
  const sorted = [...occs].sort((a, b) => a.start.getTime() - b.start.getTime());
  let cluster: { occ: Occurrence; lane: number }[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const of = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) out.set(c.occ.key, { lane: c.lane, of });
    cluster = [];
  };
  for (const o of sorted) {
    if (cluster.length && o.start.getTime() >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.occ.end.getTime() > o.start.getTime()).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ occ: o, lane });
    clusterEnd = Math.max(clusterEnd, o.end.getTime());
  }
  if (cluster.length) flush();
  return out;
}

export function CalendarView({ events, subscribed = [], tasks, onResizeOccurrence, sources, onCreate, onOpenEvent, onToggleTask, onTaskToCalendar, onMoveOccurrence, onMailToCalendar }: CalendarViewProps) {
  const prefs = usePrefs();
  const [mode, setMode] = useState<CalendarMode>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (scroller.current && (mode === 'day' || mode === 'week' || mode === 'workweek')) scroller.current.scrollTop = Math.max(0, prefs.workStart - 1) * HOUR_H;
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekStart = prefs.weekStartsOn;
  const days = useMemo(() => {
    if (mode === 'day') return [startOfDay(anchor)];
    if (mode === 'week') {
      const s = startOfWeek(anchor, weekStart);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    if (mode === 'workweek') {
      const s = startOfWeek(anchor, 1);
      return Array.from({ length: 5 }, (_, i) => addDays(s, i));
    }
    if (mode === 'agenda') return Array.from({ length: 30 }, (_, i) => addDays(startOfDay(anchor), i));
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const s = startOfWeek(first, weekStart);
    return Array.from({ length: 42 }, (_, i) => addDays(s, i));
  }, [mode, anchor, weekStart]);

  const visibleEvents = useMemo(() => events.filter((e) => calendarOf(prefs, e.calendarId).visible), [events, prefs]);
  const range = useMemo(() => ({ from: days[0], to: addDays(days[days.length - 1], 1) }), [days]);
  const occurrences = useMemo(() => expandAll([...visibleEvents, ...subscribed], range.from, range.to), [visibleEvents, subscribed, range]);
  const todayKey = dateKey(now);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    if (!prefs.showTasksOnCalendar) return map;
    for (const t of tasks) {
      if (!t.due || t.done) continue;
      map.set(t.due, [...(map.get(t.due) ?? []), t]);
    }
    return map;
  }, [tasks, prefs.showTasksOnCalendar]);

  const step = (dir: -1 | 1) =>
    setAnchor((a) =>
      mode === 'day' ? addDays(a, dir) : mode === 'week' || mode === 'workweek' ? addDays(a, dir * 7) : mode === 'agenda' ? addDays(a, dir * 30) : new Date(a.getFullYear(), a.getMonth() + dir, 1),
    );

  const title =
    mode === 'day'
      ? anchor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : mode === 'week' || mode === 'workweek'
        ? `${days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${days[days.length - 1].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${prefs.showWeekNumbers ? ` · Week ${isoWeek(days[0])}` : ''}`
        : mode === 'agenda'
          ? `Next 30 days from ${anchor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
          : anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const handleDrop = (e: React.DragEvent, target: Date) => {
    e.preventDefault();
    const occ = e.dataTransfer.getData(OCC_MIME);
    const task = e.dataTransfer.getData(TASK_MIME);
    if (occ) {
      const { id, startISO } = JSON.parse(occ) as { id: string; startISO: string };
      const event = events.find((x) => x.id === id);
      if (event) onMoveOccurrence({ event, start: new Date(startISO) }, target);
    } else if (task) {
      const t = tasks.find((x) => x.id === task);
      if (t) onTaskToCalendar(t, target);
    } else if (isMailDrag(e)) {
      const ids = readMailDrag(e);
      if (ids[0]) onMailToCalendar(ids[0], target);
    }
  };
  const allowDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(OCC_MIME) || e.dataTransfer.types.includes(TASK_MIME) || isMailDrag(e)) e.preventDefault();
  };

  const dayNames = weekStart === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-bg">
      <SidePanel events={visibleEvents} tasks={tasks} now={now} onToggleTask={onToggleTask} sources={sources} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button onClick={() => setAnchor(new Date())} className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-fg-muted hover:bg-bg-muted hover:text-fg">
              Today
            </button>
            <button onClick={() => step(-1)} aria-label="Previous" className="rounded-md p-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => step(1)} aria-label="Next" className="rounded-md p-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
              <ChevronRight className="h-4 w-4" />
            </button>
            <h1 className="text-base font-semibold text-fg" data-testid="calendar-title">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label="Calendar view" className="flex rounded-lg border border-line p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${mode === m.id ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <button onClick={() => setSettingsOpen((v) => !v)} aria-label="Calendar settings" className="rounded-md p-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg">
                <Settings2 className="h-4 w-4" />
              </button>
              {settingsOpen && <CalendarSettings onClose={() => setSettingsOpen(false)} />}
            </div>
            <button
              onClick={() => {
                const d = new Date(anchor);
                const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.max(8, new Date().getHours() + 1), 0);
                onCreate(start.toISOString());
              }}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg shadow-soft hover:brightness-105"
            >
              <Plus className="h-4 w-4" /> New event
            </button>
          </div>
        </div>

        {(mode === 'day' || mode === 'week' || mode === 'workweek') && (
          <TimeGrid
            days={days}
            occurrences={occurrences}
            tasksByDay={tasksByDay}
            todayKey={todayKey}
            now={now}
            secondaryTz={prefs.secondaryTz}
            scroller={scroller}
            onCreate={onCreate}
            onOpen={onOpenEvent}
            onToggleTask={onToggleTask}
            onResize={onResizeOccurrence}
            workStart={prefs.workStart}
            workEnd={prefs.workEnd}
            workDays={prefs.workDays}
            onDrop={handleDrop}
            allowDrop={allowDrop}
          />
        )}

        {mode === 'month' && (
          <>
            <div className="grid grid-cols-7 border-b border-line">
              {dayNames.map((w) => (
                <div key={w} className="px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{w}</div>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-7 grid-rows-6 overflow-y-auto scrollbar-thin">
              {days.map((d) => {
                const key = dateKey(d);
                const inMonth = d.getMonth() === anchor.getMonth();
                const dayOccs = occurrences.filter((o) => dateKey(o.start) === key);
                const dayTasks = tasksByDay.get(key) ?? [];
                const rows = [...dayOccs.map((o) => ({ kind: 'e' as const, o })), ...dayTasks.map((t) => ({ kind: 't' as const, t }))];
                const visible = rows.slice(0, 3);
                return (
                  <div
                    key={key}
                    data-day={key}
                    onClick={() => onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9).toISOString())}
                    onDragOver={allowDrop}
                    onDrop={(e) => handleDrop(e, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9))}
                    className={`group flex min-h-[96px] cursor-pointer flex-col gap-1 border-b border-r border-line p-1.5 hover:bg-bg-muted ${inMonth ? '' : 'bg-bg-muted/40'}`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        key === todayKey ? 'bg-accent font-semibold text-accent-fg' : inMonth ? 'text-fg' : 'text-fg-subtle'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {visible.map((r) =>
                        r.kind === 'e' ? (
                          <EventChip key={r.o.key} occ={r.o} onOpen={onOpenEvent} />
                        ) : (
                          <TaskChip key={r.t.id} task={r.t} onToggle={onToggleTask} />
                        ),
                      )}
                      {rows.length > visible.length && <span className="px-1.5 text-2xs text-fg-subtle">+{rows.length - visible.length} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {mode === 'agenda' && (
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin" data-testid="agenda">
            {days.every((d) => !occurrences.some((o) => dateKey(o.start) === dateKey(d)) && !(tasksByDay.get(dateKey(d))?.length)) && (
              <p className="py-10 text-center text-sm text-fg-muted">Nothing planned in the next 30 days.</p>
            )}
            {days.map((d) => {
              const key = dateKey(d);
              const dayOccs = occurrences.filter((o) => dateKey(o.start) === key);
              const dayTasks = tasksByDay.get(key) ?? [];
              if (!dayOccs.length && !dayTasks.length) return null;
              return (
                <section key={key} className="mb-4">
                  <h2 className={`mb-1.5 text-sm font-semibold ${key === todayKey ? 'text-accent' : 'text-fg'}`}>
                    {d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h2>
                  <div className="space-y-1">
                    {dayOccs.map((o) => (
                      <button
                        key={o.key}
                        onClick={() => onOpenEvent(o.event, o.start)}
                        className="flex w-full items-center gap-3 rounded-lg border border-line bg-bg-subtle px-3 py-2 text-left hover:border-line-strong"
                      >
                        <span className="h-8 w-1 rounded-full" style={{ backgroundColor: o.event.color }} />
                        <span className="w-28 shrink-0 text-xs text-fg-muted">{o.event.allDay ? 'All day' : `${shortTime(o.start)} – ${shortTime(o.end)}`}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{o.event.title || '(No title)'}</span>
                        {o.recurring && <RepeatIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-label="Repeats" />}
                        {o.event.location && <span className="truncate text-xs text-fg-subtle">{o.event.location}</span>}
                      </button>
                    ))}
                    {dayTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-2">
                        <button onClick={() => onToggleTask(t)} aria-label={`Mark ${t.title} as done`} className="h-4 w-4 rounded-full border border-line-strong hover:border-accent" />
                        <span className="text-sm text-fg">{t.title}</span>
                        <span className="text-2xs text-fg-subtle">Task</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
};

/** Outlook's "Show as": free is an outline, tentative is faded and dashed, out of office is purple. */
function eventStyle(e: CalendarEvent): React.CSSProperties {
  const c = e.showAs === 'oof' ? '#7c3aed' : e.color;
  if (e.showAs === 'free') return { backgroundColor: 'transparent', border: `2px solid ${c}`, color: c };
  if (e.showAs === 'tentative') return { backgroundColor: `${c}33`, border: `2px dashed ${c}`, color: c };
  if (e.showAs === 'elsewhere') return { backgroundColor: `${c}33`, borderLeft: `4px solid ${c}`, color: c };
  return { backgroundColor: c };
}

function EventChip({ occ, onOpen }: { occ: Occurrence; onOpen: CalendarViewProps['onOpenEvent'] }) {
  const e = occ.event;
  return (
    <button
      draggable
      onDragStart={(ev) => ev.dataTransfer.setData(OCC_MIME, JSON.stringify({ id: e.id, startISO: occ.start.toISOString() }))}
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(e, occ.start);
      }}
      className="flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-2xs font-medium text-white"
      style={eventStyle(e)}
      title={e.title}
    >
      {occ.recurring && <RepeatIcon className="h-2.5 w-2.5 shrink-0" aria-hidden />}
      <span className="truncate">
        {e.allDay ? '' : `${shortTime(occ.start)} `}
        {e.visibility === 'private' ? '🔒 ' : ''}
        {e.title || '(No title)'}
      </span>
    </button>
  );
}

function TaskChip({ task, onToggle }: { task: Task; onToggle: (t: Task) => void }) {
  return (
    <span
      draggable
      onDragStart={(ev) => ev.dataTransfer.setData(TASK_MIME, task.id)}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 truncate rounded border border-dashed border-line-strong px-1 py-0.5 text-2xs text-fg"
    >
      <button onClick={() => onToggle(task)} aria-label={`Mark ${task.title} as done`} className="h-3 w-3 shrink-0 rounded-full border border-line-strong hover:border-accent" />
      <span className="truncate">{task.title}</span>
    </span>
  );
}

function TimeGrid({
  days, occurrences, tasksByDay, todayKey, now, secondaryTz, scroller, onCreate, onOpen, onToggleTask, onDrop, allowDrop, onResize, workStart, workEnd, workDays,
}: {
  onResize: CalendarViewProps['onResizeOccurrence'];
  workStart: number;
  workEnd: number;
  workDays: number[];
  days: Date[];
  occurrences: Occurrence[];
  tasksByDay: Map<string, Task[]>;
  todayKey: string;
  now: Date;
  secondaryTz: string;
  scroller: React.RefObject<HTMLDivElement>;
  onCreate: CalendarViewProps['onCreate'];
  onOpen: CalendarViewProps['onOpenEvent'];
  onToggleTask: (t: Task) => void;
  onDrop: (e: React.DragEvent, target: Date) => void;
  allowDrop: (e: React.DragEvent) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const cols = `${secondaryTz ? '88px' : '48px'} repeat(${days.length}, minmax(0, 1fr))`;
  const at = (day: Date, e: React.MouseEvent | React.DragEvent, el: HTMLElement) => {
    const y = e.clientY - el.getBoundingClientRect().top;
    const minutes = Math.min(23 * 60 + 45, Math.max(0, Math.round(((y / HOUR_H) * 60) / 15) * 15));
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
  };
  const tz = localTz();
  const [resizing, setResizing] = useState<{ key: string; endMs: number } | null>(null);
  const resizeGuard = useRef(false);
  const startResize = (e: React.MouseEvent, o: Occurrence) => {
    e.preventDefault();
    e.stopPropagation();
    resizeGuard.current = true;
    const y0 = e.clientY;
    const end0 = o.end.getTime();
    const endFor = (y: number) => {
      const mins = Math.round((((end0 - o.start.getTime()) / 60000 + ((y - y0) / HOUR_H) * 60)) / 15) * 15;
      return o.start.getTime() + Math.max(15, mins) * 60000;
    };
    const move = (ev: MouseEvent) => setResizing({ key: o.key, endMs: endFor(ev.clientY) });
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      resizeGuard.current = false;
      // The click that follows letting go of the mouse must not open or create anything.
      const swallow = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, true), 100);
      setResizing(null);
      const endMs = endFor(ev.clientY);
      if (endMs !== end0) onResize({ event: o.event, start: o.start }, new Date(endMs));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
        <div className="flex items-end justify-center pb-1 text-2xs text-fg-subtle">{secondaryTz ? `${tz.split('/').pop()?.replace('_', ' ')} · ${secondaryTz.split('/').pop()?.replace('_', ' ')}` : ''}</div>
        {days.map((d) => {
          const key = dateKey(d);
          const allDay = occurrences.filter((o) => o.event.allDay && dateKey(o.start) <= key && key <= dateKey(new Date(o.end.getTime() - 1)));
          const dayTasks = tasksByDay.get(key) ?? [];
          return (
            <div
              key={key}
              onDragOver={allowDrop}
              onDrop={(e) => onDrop(e, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9))}
              className="min-w-0 border-l border-line px-1 pb-1 pt-1.5"
            >
              <button
                onClick={() => onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(), undefined, true)}
                className={`mx-auto mb-1 flex flex-col items-center rounded-lg px-2 py-0.5 hover:bg-bg-muted ${key === todayKey ? 'text-accent' : 'text-fg'}`}
                title="New all-day event"
              >
                <span className="text-2xs font-semibold uppercase tracking-wider">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${key === todayKey ? 'bg-accent text-accent-fg' : ''}`}>{d.getDate()}</span>
              </button>
              <div className="flex flex-col gap-0.5">
                {allDay.map((o) => <EventChip key={o.key} occ={o} onOpen={onOpen} />)}
                {dayTasks.map((t) => <TaskChip key={t.id} task={t} onToggle={onToggleTask} />)}
              </div>
            </div>
          );
        })}
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto scrollbar-thin" data-testid="time-grid">
        <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_H }}>
          <div className="relative flex">
            {secondaryTz && (
              <div className="relative w-10 shrink-0">
                {hours.map((h) => {
                  const probe = new Date(2026, 0, 1, h);
                  return (
                    <span key={h} className="absolute right-1 -translate-y-1/2 text-2xs text-fg-subtle" style={{ top: h * HOUR_H }}>
                      {h === 0 ? '' : probe.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: secondaryTz })}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="relative flex-1">
              {hours.map((h) => (
                <span key={h} className="absolute right-1 -translate-y-1/2 text-2xs text-fg-subtle" style={{ top: h * HOUR_H }}>
                  {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>
          </div>
          {days.map((d) => {
            const key = dateKey(d);
            const dayStart = startOfDay(d).getTime();
            const dayEnd = addDays(startOfDay(d), 1).getTime();
            const timed = occurrences.filter((o) => !o.event.allDay && o.start.getTime() < dayEnd && o.end.getTime() > dayStart);
            const placed = lanes(timed);
            return (
              <div
                key={key}
                data-day={key}
                className={`relative border-l border-line ${workDays.includes(d.getDay()) ? '' : 'bg-bg-muted/50'}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('[data-event]')) return;
                  const s = at(d, e, e.currentTarget);
                  onCreate(s.toISOString(), new Date(s.getTime() + 3600000).toISOString());
                }}
                onDragOver={allowDrop}
                onDrop={(e) => onDrop(e, at(d, e, e.currentTarget))}
              >
                {workDays.includes(d.getDay()) && (
                  <>
                    <div className="pointer-events-none absolute inset-x-0 top-0 bg-bg-muted/50" style={{ height: workStart * HOUR_H }} data-testid="off-hours" />
                    <div className="pointer-events-none absolute inset-x-0 bg-bg-muted/50" style={{ top: workEnd * HOUR_H, height: Math.max(0, 24 - workEnd) * HOUR_H }} />
                  </>
                )}
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: h * HOUR_H }} />
                ))}
                {timed.map((o) => {
                  const s = Math.max(o.start.getTime(), dayStart);
                  const e = Math.min(resizing?.key === o.key ? resizing.endMs : o.end.getTime(), dayEnd);
                  const top = ((s - dayStart) / 3600000) * HOUR_H;
                  const height = Math.max(20, ((e - s) / 3600000) * HOUR_H - 2);
                  const { lane, of } = placed.get(o.key) ?? { lane: 0, of: 1 };
                  return (
                    <button
                      key={o.key}
                      data-event
                      draggable
                      onDragStart={(ev) => {
                        if (resizeGuard.current || o.event.id.startsWith('sub:')) {
                          ev.preventDefault();
                          return;
                        }
                        ev.dataTransfer.setData(OCC_MIME, JSON.stringify({ id: o.event.id, startISO: o.start.toISOString() }));
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpen(o.event, o.start);
                      }}
                      className="absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-2xs font-medium leading-tight text-white shadow-soft"
                      style={{ top, height, left: `calc(${(lane / of) * 100}% + 1px)`, width: `calc(${100 / of}% - 3px)`, ...eventStyle(o.event) }}
                      title={o.event.title}
                    >
                      <span className="block truncate font-semibold">
                        {o.event.visibility === 'private' ? '🔒 ' : ''}
                        {o.event.title || '(No title)'}
                      </span>
                      <span className="block truncate opacity-90">
                        {shortTime(o.start)} – {shortTime(o.end)}
                        {o.event.tz && o.event.tz !== tz ? ` (${shortTime(o.start, o.event.tz)} ${o.event.tz.split('/').pop()?.replace('_', ' ')})` : ''}
                      </span>
                      {!o.event.id.startsWith('sub:') && (
                        <span
                          data-resize
                          onMouseDown={(ev) => startResize(ev, o)}
                          onClick={(ev) => ev.stopPropagation()}
                          className="absolute inset-x-0 -bottom-0.5 h-2 cursor-ns-resize"
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
                {key === todayKey && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H }} data-testid="now-line">
                    <span className="-ml-1 h-2 w-2 rounded-full bg-danger" />
                    <span className="h-px flex-1 bg-danger" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SidePanel({ events, tasks, now, onToggleTask, sources }: { events: CalendarEvent[]; tasks: Task[]; now: Date; onToggleTask: (t: Task) => void; sources: React.ReactNode }) {
  const prefs = usePrefs();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const today = startOfDay(now);
  const todays = useMemo(() => expandAll(events, today, addDays(today, 1)), [events, today.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const dueTasks = tasks.filter((t) => t.due && !t.done && t.due <= dateKey(now));
  const cals = calendarsOf(prefs);

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-bg-subtle p-3 scrollbar-thin lg:flex" aria-label="Calendars and My Day">
      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">My calendars</h2>
          <button onClick={() => setAdding((v) => !v)} aria-label="Add calendar" className="rounded p-0.5 text-fg-subtle hover:bg-bg-muted hover:text-fg">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {adding && (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Calendar name"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                addCalendar(name, EVENT_COLORS[cals.length % EVENT_COLORS.length]);
                setName('');
                setAdding(false);
              }
              if (e.key === 'Escape') setAdding(false);
            }}
            className="mb-1.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm"
          />
        )}
        <ul className="space-y-0.5">
          {cals.map((c) => (
            <li key={c.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-bg-muted">
              <button
                role="checkbox"
                aria-checked={c.visible}
                aria-label={`Show ${c.name}`}
                onClick={() => editCalendar(c.id, { visible: !c.visible })}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                style={{ borderColor: c.color, backgroundColor: c.visible ? c.color : 'transparent' }}
              >
                {c.visible && <Check className="h-3 w-3 text-white" />}
              </button>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{c.name}</span>
              {c.id !== 'default' && (
                <button onClick={() => removeCalendar(c.id)} aria-label={`Delete ${c.name}`} className="hidden text-fg-subtle hover:text-danger group-hover:block">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {sources}

      <section aria-label="My Day">
        <h2 className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
          <CalendarDays className="h-3.5 w-3.5" /> My Day
        </h2>
        <p className="mb-2 text-xs text-fg-muted">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        {todays.length === 0 && dueTasks.length === 0 && <p className="text-xs text-fg-subtle">Nothing today.</p>}
        <ul className="space-y-1">
          {todays.map((o) => (
            <li key={o.key} className="flex items-center gap-2 text-xs text-fg">
              <span className="h-3 w-1 shrink-0 rounded-full" style={{ backgroundColor: o.event.color }} />
              <span className="w-10 shrink-0 text-fg-subtle">{o.event.allDay ? 'All day' : shortTime(o.start)}</span>
              <span className="truncate">{o.event.title || '(No title)'}</span>
            </li>
          ))}
        </ul>
        {dueTasks.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Tasks to do</p>
            <ul className="space-y-1">
              {dueTasks.map((t) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(TASK_MIME, t.id)}
                  className="flex cursor-grab items-center gap-2 rounded border border-dashed border-line-strong px-1.5 py-1 text-xs text-fg"
                  title="Drag onto the calendar to block out time"
                >
                  <button onClick={() => onToggleTask(t)} aria-label={`Mark ${t.title} as done`} className="h-3.5 w-3.5 shrink-0 rounded-full border border-line-strong hover:border-accent" />
                  <span className="truncate">{t.title}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-2xs text-fg-subtle">Drag a task onto the calendar to block out time for it.</p>
          </>
        )}
      </section>
    </aside>
  );
}

function CalendarSettings({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs();
  const zones = useMemo(() => allTimeZones(), []);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div role="dialog" aria-label="Calendar settings" className="absolute right-0 z-50 mt-1 w-72 space-y-3 rounded-lg border border-line-strong bg-bg-subtle p-3 shadow-pop">
        <div>
          <label htmlFor="cal-week" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Week starts on</label>
          <select id="cal-week" value={prefs.weekStartsOn} onChange={(e) => setWeekStart(Number(e.target.value) as 0 | 1)} className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm">
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </div>
        <div>
          <label htmlFor="cal-tz" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Second time zone</label>
          <select id="cal-tz" value={prefs.secondaryTz} onChange={(e) => setSecondaryTz(e.target.value)} className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm">
            <option value="">None</option>
            {zones.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div>
          <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Working hours</p>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <select aria-label="Work starts" value={prefs.workStart} onChange={(e) => setWorkingHours(Number(e.target.value), Math.max(Number(e.target.value) + 1, prefs.workEnd), prefs.workDays)} className="rounded-md border border-line bg-bg px-2 py-1 text-sm">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
            <span>to</span>
            <select aria-label="Work ends" value={prefs.workEnd} onChange={(e) => setWorkingHours(Math.min(prefs.workStart, Number(e.target.value) - 1), Number(e.target.value), prefs.workDays)} className="rounded-md border border-line bg-bg px-2 py-1 text-sm">
              {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{String(h % 24).padStart(2, '0')}:00</option>)}
            </select>
          </div>
          <div className="mt-1.5 flex gap-1" role="group" aria-label="Working days">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => {
              const on = prefs.workDays.includes(i);
              return (
                <button key={i} type="button" aria-pressed={on} aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}
                  onClick={() => setWorkingHours(prefs.workStart, prefs.workEnd, on ? prefs.workDays.filter((d) => d !== i) : [...prefs.workDays, i])}
                  className={`h-7 w-7 rounded-full text-xs font-medium ${on ? 'bg-accent text-accent-fg' : 'border border-line text-fg-muted'}`}>{l}</button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={prefs.showWeekNumbers} onChange={(e) => setShowWeekNumbers(e.target.checked)} />
          Show week numbers
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={prefs.showTasksOnCalendar} onChange={(e) => setShowTasksOnCalendar(e.target.checked)} />
          Show tasks with a due date
        </label>
      </div>
    </>
  );
}
