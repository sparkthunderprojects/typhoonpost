import type { CalendarEvent, Repeat } from '@/types';

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const startOfWeek = (d: Date, weekStartsOn = 0) => addDays(startOfDay(d), -((d.getDay() - weekStartsOn + 7) % 7));

/** One showing of an event on the calendar. A repeating event has many. */
export interface Occurrence {
  event: CalendarEvent;
  start: Date;
  end: Date;
  /** Unique per showing: the event id and the day it falls on. */
  key: string;
  recurring: boolean;
}

const MAX_STEPS = 6000;

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Start times of every occurrence from the first one, in order, as local wall-clock dates. */
function* starts(first: Date, r: Repeat): Generator<Date> {
  const step = Math.max(1, Math.floor(r.interval || 1));
  const h = first.getHours();
  const mi = first.getMinutes();
  if (r.freq === 'daily') {
    for (let k = 0; k < MAX_STEPS; k++) yield new Date(first.getFullYear(), first.getMonth(), first.getDate() + k * step, h, mi);
  } else if (r.freq === 'weekly') {
    const days = (r.byDay?.length ? [...new Set(r.byDay)] : [first.getDay()]).sort((a, b) => a - b);
    const week0 = addDays(startOfDay(first), -first.getDay());
    for (let w = 0; w < MAX_STEPS; w++) {
      for (const d of days) {
        const s = new Date(week0.getFullYear(), week0.getMonth(), week0.getDate() + w * step * 7 + d, h, mi);
        if (s.getTime() >= first.getTime()) yield s;
      }
    }
  } else if (r.freq === 'monthly') {
    for (let k = 0; k < MAX_STEPS; k++) {
      const total = first.getMonth() + k * step;
      const y = first.getFullYear() + Math.floor(total / 12);
      const m = ((total % 12) + 12) % 12;
      yield new Date(y, m, Math.min(first.getDate(), daysInMonth(y, m)), h, mi); // the 31st becomes the last day of a short month
    }
  } else {
    for (let k = 0; k < MAX_STEPS; k++) {
      const y = first.getFullYear() + k * step;
      yield new Date(y, first.getMonth(), Math.min(first.getDate(), daysInMonth(y, first.getMonth())), h, mi);
    }
  }
}

/** Every occurrence of an event that touches [from, to). */
export function expandEvent(ev: CalendarEvent, from: Date, to: Date): Occurrence[] {
  const first = new Date(ev.start);
  const duration = new Date(ev.end).getTime() - first.getTime();
  const make = (s: Date, recurring: boolean): Occurrence => ({
    event: ev, start: s, end: new Date(s.getTime() + duration), key: `${ev.id}@${dateKey(s)}`, recurring,
  });
  const touches = (s: Date) => s.getTime() < to.getTime() && s.getTime() + Math.max(duration, 1) > from.getTime();

  if (!ev.repeat) return touches(first) ? [make(first, false)] : [];

  const out: Occurrence[] = [];
  const skipped = new Set(ev.exdates ?? []);
  let n = 0;
  for (const s of starts(first, ev.repeat)) {
    if (ev.repeat.count && n >= ev.repeat.count) break;
    if (ev.repeat.until && dateKey(s) > ev.repeat.until) break;
    n++;
    if (s.getTime() >= to.getTime()) break;
    if (skipped.has(dateKey(s))) continue;
    if (touches(s)) out.push(make(s, true));
  }
  return out;
}

export function expandAll(events: CalendarEvent[], from: Date, to: Date): Occurrence[] {
  return events.flatMap((e) => expandEvent(e, from, to)).sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ---- Time zones ----

/** Minutes the zone is ahead of UTC at this moment. */
export function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const v = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The moment a wall-clock time ("2026-11-23T09:00") happens in the given zone. */
export function zonedWallToInstant(wall: string, tz: string): Date {
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(NaN);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = guess - tzOffsetMinutes(new Date(guess), tz) * 60000;
  t = guess - tzOffsetMinutes(new Date(t), tz) * 60000; // once more, in case the first guess crossed a clock change
  return new Date(t);
}

/** The wall-clock time ("YYYY-MM-DDTHH:mm") a moment has in the given zone. */
export function instantToZonedWall(at: Date, tz: string): string {
  const shifted = new Date(at.getTime() + tzOffsetMinutes(at, tz) * 60000);
  return shifted.toISOString().slice(0, 16);
}

export const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function allTimeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
  }
}

export function shortTime(d: Date, tz?: string): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) });
}

// ---- Reminders ----

export const REMINDER_CHOICES: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'At the time of the event' },
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
];

export interface DueReminder { key: string; occurrence: Occurrence; minutes: number }

/** Reminders whose moment has arrived (within the last 10 minutes) and are not yet fired. */
export function dueReminders(events: CalendarEvent[], now: Date, fired: Set<string>): DueReminder[] {
  const from = new Date(now.getTime() - 10 * 60000);
  const to = new Date(now.getTime() + 1441 * 60000);
  const out: DueReminder[] = [];
  for (const ev of events) {
    if (!ev.reminders?.length || ev.allDay) continue;
    for (const occ of expandEvent(ev, from, to)) {
      for (const minutes of ev.reminders) {
        const at = occ.start.getTime() - minutes * 60000;
        const key = `${occ.key}#${minutes}`;
        if (at <= now.getTime() && at > now.getTime() - 10 * 60000 && !fired.has(key)) out.push({ key, occurrence: occ, minutes });
      }
    }
  }
  return out;
}

export function describeRepeat(r?: Repeat): string {
  if (!r) return 'Does not repeat';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  const every = r.interval > 1 ? `Every ${r.interval} ${unit}s` : `Every ${unit}`;
  const end = r.until ? `, until ${r.until}` : r.count ? `, ${r.count} times` : '';
  return every + end;
}

/** The due date (YYYY-MM-DD) of the next copy of a repeating task, counted from the date it was due. */
export function nextDue(due: string | null, r: Repeat, today = new Date()): string {
  const base = due ? new Date(`${due}T00:00:00`) : startOfDay(today);
  const step = Math.max(1, Math.floor(r.interval || 1));
  let next: Date;
  if (r.freq === 'daily') next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + step);
  else if (r.freq === 'weekly') {
    const days = (r.byDay?.length ? [...new Set(r.byDay)] : [base.getDay()]).sort((a, b) => a - b);
    const later = days.find((d) => d > base.getDay());
    next = later !== undefined && step === 1
      ? new Date(base.getFullYear(), base.getMonth(), base.getDate() + (later - base.getDay()))
      : new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay() + days[0] + step * 7);
  } else if (r.freq === 'monthly') {
    const total = base.getMonth() + step;
    const y = base.getFullYear() + Math.floor(total / 12);
    const m = total % 12;
    next = new Date(y, m, Math.min(base.getDate(), daysInMonth(y, m)));
  } else {
    const y = base.getFullYear() + step;
    next = new Date(y, base.getMonth(), Math.min(base.getDate(), daysInMonth(y, base.getMonth())));
  }
  return dateKey(next);
}
