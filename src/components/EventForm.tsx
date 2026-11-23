import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CalendarDays, Trash2 } from 'lucide-react';
import type { CalendarEvent, Repeat } from '@/types';
import { EVENT_COLORS } from '@/types';
import { calendarsOf, DEFAULT_CALENDAR_ID, usePrefs } from '@/lib/prefs';
import { allTimeZones, describeRepeat, instantToZonedWall, localTz, REMINDER_CHOICES, zonedWallToInstant } from '@/lib/calendar';

interface EventFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (draft: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  /** `scope` tells a repeating event whether to remove one showing or the whole series. */
  onDelete?: (id: string, scope: 'one' | 'all') => void;
  editing: CalendarEvent | null;
  defaultStartISO?: string;
  defaultEndISO?: string;
  defaultAllDay?: boolean;
  defaultTitle?: string;
  defaultDescription?: string;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Ends = 'never' | 'until' | 'count';

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string {
  return new Date(v).toISOString();
}

export function EventForm({ open, onClose, onSave, onDelete, editing, defaultStartISO, defaultEndISO, defaultAllDay, defaultTitle, defaultDescription }: EventFormProps) {
  const prefs = usePrefs();
  const zones = allTimeZones();
  const cals = calendarsOf(prefs);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [calendarId, setCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [freq, setFreq] = useState<Repeat['freq'] | ''>('');
  const [interval, setIntervalN] = useState(1);
  const [byDay, setByDay] = useState<number[]>([]);
  const [ends, setEnds] = useState<Ends>('never');
  const [until, setUntil] = useState('');
  const [count, setCount] = useState(10);
  const [reminders, setReminders] = useState<number[]>([]);
  const [tz, setTz] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    const loadRepeat = (r?: Repeat) => {
      setFreq(r?.freq ?? '');
      setIntervalN(r?.interval ?? 1);
      setByDay(r?.byDay ?? []);
      setEnds(r?.until ? 'until' : r?.count ? 'count' : 'never');
      setUntil(r?.until ?? '');
      setCount(r?.count ?? 10);
    };
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description);
      setLocation(editing.location);
      setAllDay(editing.allDay);
      const zone = editing.tz && !editing.allDay ? editing.tz : '';
      setTz(zone);
      setStart(zone ? instantToZonedWall(new Date(editing.start), zone) : toLocalInputValue(editing.start));
      setEnd(zone ? instantToZonedWall(new Date(editing.end), zone) : toLocalInputValue(editing.end));
      setColor(editing.color);
      setCalendarId(editing.calendarId ?? DEFAULT_CALENDAR_ID);
      loadRepeat(editing.repeat);
      setReminders(editing.reminders ?? []);
      setIsPrivate(editing.visibility === 'private');
    } else {
      const base = defaultStartISO ?? new Date().toISOString();
      const startDate = new Date(base);
      const endDate = defaultEndISO ? new Date(defaultEndISO) : new Date(startDate.getTime() + 60 * 60 * 1000);
      const wholeDay = !!defaultAllDay;
      setTitle(defaultTitle ?? '');
      setDescription(defaultDescription ?? '');
      setLocation('');
      setAllDay(wholeDay);
      setStart(toLocalInputValue(startDate.toISOString()));
      setEnd(wholeDay ? toLocalInputValue(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59).toISOString()) : toLocalInputValue(endDate.toISOString()));
      setColor(EVENT_COLORS[0]);
      setCalendarId(DEFAULT_CALENDAR_ID);
      loadRepeat(undefined);
      setReminders([]);
      setTz('');
      setIsPrivate(false);
    }
  }, [open, editing, defaultStartISO, defaultEndISO, defaultAllDay, defaultTitle, defaultDescription]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end) return;
    const zone = tz && tz !== localTz() && !allDay ? tz : '';
    const toIso = (v: string) => (zone ? zonedWallToInstant(v, zone).toISOString() : fromLocalInputValue(v));
    const startIso = toIso(start);
    let endIso = toIso(end);
    if (new Date(endIso) < new Date(startIso)) endIso = new Date(new Date(startIso).getTime() + 3600000).toISOString();
    const repeat: Repeat | undefined = freq
      ? {
          freq,
          interval: Math.max(1, interval || 1),
          ...(freq === 'weekly' && byDay.length ? { byDay: [...byDay].sort((a, b) => a - b) } : {}),
          ...(ends === 'until' && until ? { until } : {}),
          ...(ends === 'count' && count > 0 ? { count } : {}),
        }
      : undefined;
    onSave({
      id: editing?.id,
      title: title.trim() || '(No title)',
      description,
      location,
      allDay,
      start: startIso,
      end: endIso,
      color,
      calendarId: calendarId === DEFAULT_CALENDAR_ID ? undefined : calendarId,
      repeat,
      exdates: repeat ? editing?.exdates : undefined,
      reminders: reminders.length ? [...reminders].sort((a, b) => a - b) : undefined,
      tz: zone || undefined,
      visibility: isPrivate ? 'private' : undefined,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-line-strong bg-bg-subtle shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-line bg-bg-muted px-4 py-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-fg">
                {editing ? 'Edit event' : 'New event'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-3 overflow-y-auto p-4 scrollbar-thin">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm font-medium outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />

            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-line"
              />
              All day
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                  Starts
                </label>
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  required
                  value={allDay ? start.slice(0, 10) : start}
                  onChange={(e) => setStart(allDay ? `${e.target.value}T00:00` : e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                  Ends
                </label>
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  required
                  value={allDay ? end.slice(0, 10) : end}
                  onChange={(e) => setEnd(allDay ? `${e.target.value}T23:59` : e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent scrollbar-thin"
            />

            <div>
              <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Color
              </label>
              <div className="flex gap-2">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-offset-2 ring-offset-bg-subtle' : ''}`}
                    style={{ backgroundColor: c, ...(color === c ? { boxShadow: `0 0 0 2px ${c}` } : {}) }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ev-cal" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Calendar</label>
                <select
                  id="ev-cal"
                  value={calendarId}
                  onChange={(e) => {
                    setCalendarId(e.target.value);
                    const c = cals.find((x) => x.id === e.target.value);
                    if (c && !editing) setColor(c.color);
                  }}
                  className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm"
                >
                  {cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ev-tz" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Time zone</label>
                <select
                  id="ev-tz"
                  value={tz}
                  disabled={allDay}
                  onChange={(e) => {
                    // Keep the same instant: show it as the wall time in the zone being chosen.
                    const next = e.target.value;
                    if (start && end) {
                      const from = tz || localTz();
                      const to = next || localTz();
                      const conv = (v: string) => instantToZonedWall(zonedWallToInstant(v, from), to);
                      setStart(conv(start));
                      setEnd(conv(end));
                    }
                    setTz(next);
                  }}
                  className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm disabled:opacity-50"
                >
                  <option value="">My time zone ({localTz().replace('_', ' ')})</option>
                  {zones.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="ev-repeat" className="block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Repeat</label>
              <select
                id="ev-repeat"
                value={freq}
                onChange={(e) => {
                  const f = e.target.value as Repeat['freq'] | '';
                  setFreq(f);
                  if (f === 'weekly' && !byDay.length && start) setByDay([new Date(start).getDay()]);
                }}
                className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm"
              >
                <option value="">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              {freq && (
                <div className="space-y-2 rounded-lg border border-line bg-bg p-2.5">
                  <div className="flex items-center gap-2 text-sm text-fg-muted">
                    <label htmlFor="ev-interval">Every</label>
                    <input
                      id="ev-interval"
                      type="number"
                      min={1}
                      max={99}
                      value={interval}
                      onChange={(e) => setIntervalN(Number(e.target.value))}
                      className="w-16 rounded-md border border-line bg-bg-subtle px-2 py-1 text-sm"
                    />
                    <span>{{ daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' }[freq]}</span>
                  </div>
                  {freq === 'weekly' && (
                    <div className="flex gap-1" role="group" aria-label="Repeat on">
                      {WEEKDAY_LABELS.map((l, i) => {
                        const on = byDay.includes(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            aria-label={WEEKDAY_NAMES[i]}
                            aria-pressed={on}
                            onClick={() => setByDay(on ? byDay.filter((d) => d !== i) : [...byDay, i])}
                            className={`h-7 w-7 rounded-full text-xs font-medium ${on ? 'bg-accent text-accent-fg' : 'border border-line text-fg-muted hover:bg-bg-muted'}`}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                    <label htmlFor="ev-ends">Ends</label>
                    <select id="ev-ends" value={ends} onChange={(e) => setEnds(e.target.value as Ends)} className="rounded-md border border-line bg-bg-subtle px-2 py-1 text-sm">
                      <option value="never">Never</option>
                      <option value="until">On a date</option>
                      <option value="count">After a number of times</option>
                    </select>
                    {ends === 'until' && (
                      <input type="date" aria-label="Repeat until" value={until} onChange={(e) => setUntil(e.target.value)} className="rounded-md border border-line bg-bg-subtle px-2 py-1 text-sm" />
                    )}
                    {ends === 'count' && (
                      <input type="number" aria-label="Number of times" min={1} max={999} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-20 rounded-md border border-line bg-bg-subtle px-2 py-1 text-sm" />
                    )}
                  </div>
                  <p className="text-2xs text-fg-subtle">
                    {describeRepeat({
                      freq, interval, ...(ends === 'until' && until ? { until } : {}), ...(ends === 'count' ? { count } : {}),
                    })}
                  </p>
                </div>
              )}
            </div>

            <fieldset>
              <legend className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Reminders</legend>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_CHOICES.map((r) => {
                  const on = reminders.includes(r.minutes);
                  return (
                    <button
                      key={r.minutes}
                      type="button"
                      aria-pressed={on}
                      disabled={allDay}
                      onClick={() => setReminders(on ? reminders.filter((m) => m !== r.minutes) : [...reminders, r.minutes])}
                      className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-40 ${on ? 'border-accent bg-accent/10 text-accent' : 'border-line text-fg-muted hover:bg-bg-muted'}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-2xs text-fg-subtle">Reminders appear while Typhoonpost is open. Your mail server never sees them.</p>
            </fieldset>

            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="h-4 w-4 rounded border-line" />
              Private event (shown as “Busy” when calendars are shared)
            </label>

            <div className="flex items-center justify-between border-t border-line pt-3">
              {editing && onDelete ? (
                confirmDelete && editing.repeat ? (
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => { onDelete(editing.id, 'one'); onClose(); }} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-danger hover:bg-danger/10">
                      This event only
                    </button>
                    <button type="button" onClick={() => { onDelete(editing.id, 'all'); onClose(); }} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-danger hover:bg-danger/10">
                      All events
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (editing.repeat) { setConfirmDelete(true); return; }
                      onDelete(editing.id, 'all');
                      onClose();
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-soft transition-all hover:brightness-105 active:scale-[0.98]"
              >
                {editing ? 'Save changes' : 'Create event'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
