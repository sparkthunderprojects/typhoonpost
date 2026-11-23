import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { CalendarEvent } from '@/types';

interface CalendarViewProps {
  events: CalendarEvent[];
  onCreate: (dateISO: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfCalendarGrid(monthDate: Date): Date {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - firstOfMonth.getDay());
  return start;
}

export function CalendarView({ events, onCreate, onOpenEvent }: CalendarViewProps) {
  const [monthDate, setMonthDate] = useState(() => new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = toDateKey(new Date(ev.start));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const gridDays = useMemo(() => {
    const start = startOfCalendarGrid(monthDate);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [monthDate]);

  const today = toDateKey(new Date());
  const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const goToday = () => setMonthDate(new Date());
  const goPrev = () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNext = () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const newEventAt = (d: Date) => {
    const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0).toISOString();
    onCreate(iso);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-bg">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-fg">{monthLabel}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              className="rounded-md p-1 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goNext}
              className="rounded-md p-1 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={goToday}
            className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          >
            Today
          </button>
        </div>
        <button
          onClick={() => newEventAt(new Date())}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg shadow-soft transition-all hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New event
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wider text-fg-subtle"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 grid-rows-6 overflow-y-auto scrollbar-thin">
        {gridDays.map((d) => {
          const key = toDateKey(d);
          const inMonth = d.getMonth() === monthDate.getMonth();
          const isToday = key === today;
          const dayEvents = eventsByDay.get(key) ?? [];
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;

          return (
            <div
              key={key}
              onClick={() => newEventAt(d)}
              className={`group flex min-h-[96px] cursor-pointer flex-col gap-1 border-b border-r border-line p-1.5 transition-colors hover:bg-bg-muted ${
                inMonth ? '' : 'bg-bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? 'bg-accent font-semibold text-accent-fg'
                      : inMonth
                        ? 'text-fg'
                        : 'text-fg-subtle'
                  }`}
                >
                  {d.getDate()}
                </span>
                <Plus className="h-3 w-3 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="flex flex-col gap-0.5">
                {visible.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEvent(ev);
                    }}
                    className="truncate rounded px-1.5 py-0.5 text-left text-2xs font-medium text-white transition-transform hover:scale-[1.02]"
                    style={{ backgroundColor: ev.color }}
                    title={ev.title}
                  >
                    {ev.allDay ? '' : `${new Date(ev.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} `}
                    {ev.title || '(No title)'}
                  </button>
                ))}
                {overflow > 0 && (
                  <span className="px-1.5 text-2xs text-fg-subtle">+{overflow} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
