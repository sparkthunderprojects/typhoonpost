import { describe, expect, it } from 'vitest';
import { dateKey, dueReminders, expandEvent, instantToZonedWall, tzOffsetMinutes, zonedWallToInstant } from '../calendar';
import type { CalendarEvent } from '../../types';

const ev = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e', title: 'Stand-up', description: '', location: '', start: new Date(2026, 10, 2, 9, 0).toISOString(),
  end: new Date(2026, 10, 2, 9, 30).toISOString(), allDay: false, color: '#000', ...over,
});
const keys = (e: CalendarEvent, from: Date, to: Date) => expandEvent(e, from, to).map((o) => dateKey(o.start));
const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('single events', () => {
  it('shows only when it touches the range', () => {
    expect(keys(ev(), D(2026, 11, 1), D(2026, 11, 8))).toEqual(['2026-11-02']);
    expect(keys(ev(), D(2026, 11, 3), D(2026, 11, 8))).toEqual([]);
  });
  it('an event running past midnight appears on the next day too', () => {
    const night = ev({ start: new Date(2026, 10, 2, 22, 0).toISOString(), end: new Date(2026, 10, 3, 2, 0).toISOString() });
    expect(expandEvent(night, D(2026, 11, 3), D(2026, 11, 4))).toHaveLength(1);
  });
});

describe('repeating events', () => {
  it('daily with an interval', () => {
    expect(keys(ev({ repeat: { freq: 'daily', interval: 2 } }), D(2026, 11, 1), D(2026, 11, 9))).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08']);
  });
  it('weekly on chosen days, never before the first event', () => {
    const e = ev({ repeat: { freq: 'weekly', interval: 1, byDay: [1, 3, 5] } }); // Mon 2 Nov
    expect(keys(e, D(2026, 11, 1), D(2026, 11, 14))).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13']);
    const late = ev({ start: new Date(2026, 10, 4, 9).toISOString(), end: new Date(2026, 10, 4, 10).toISOString(), repeat: { freq: 'weekly', interval: 1, byDay: [1, 3] } });
    expect(keys(late, D(2026, 11, 1), D(2026, 11, 10))).toEqual(['2026-11-04', '2026-11-09']);
  });
  it('every other week', () => {
    expect(keys(ev({ repeat: { freq: 'weekly', interval: 2 } }), D(2026, 11, 1), D(2026, 12, 8))).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
  });
  it('monthly on the 31st lands on the last day of short months', () => {
    const e = ev({ start: new Date(2026, 0, 31, 9).toISOString(), end: new Date(2026, 0, 31, 10).toISOString(), repeat: { freq: 'monthly', interval: 1 } });
    expect(keys(e, D(2026, 1, 1), D(2026, 5, 1))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('yearly, including 29 February', () => {
    const e = ev({ start: new Date(2024, 1, 29, 9).toISOString(), end: new Date(2024, 1, 29, 10).toISOString(), repeat: { freq: 'yearly', interval: 1 } });
    expect(keys(e, D(2024, 1, 1), D(2027, 1, 1))).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
  });
  it('stops at the count or the until date', () => {
    expect(keys(ev({ repeat: { freq: 'daily', interval: 1, count: 3 } }), D(2026, 11, 1), D(2026, 12, 1))).toHaveLength(3);
    expect(keys(ev({ repeat: { freq: 'daily', interval: 1, until: '2026-11-04' } }), D(2026, 11, 1), D(2026, 12, 1))).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });
  it('deleted occurrences still count towards the total', () => {
    const e = ev({ repeat: { freq: 'daily', interval: 1, count: 3 }, exdates: ['2026-11-03'] });
    expect(keys(e, D(2026, 11, 1), D(2026, 12, 1))).toEqual(['2026-11-02', '2026-11-04']);
  });
  it('keeps the wall-clock time across a clock change', () => {
    const e = ev({ repeat: { freq: 'daily', interval: 1 }, start: new Date(2026, 9, 24, 9).toISOString(), end: new Date(2026, 9, 24, 10).toISOString() });
    for (const o of expandEvent(e, D(2026, 10, 24), D(2026, 11, 3))) expect(o.start.getHours()).toBe(9);
  });
  it('has a unique key per showing', () => {
    const o = expandEvent(ev({ repeat: { freq: 'daily', interval: 1 } }), D(2026, 11, 1), D(2026, 11, 6));
    expect(new Set(o.map((x) => x.key)).size).toBe(o.length);
  });
});

describe('time zones', () => {
  it('knows offsets, with daylight saving', () => {
    expect(tzOffsetMinutes(new Date('2026-11-23T12:00:00Z'), 'America/New_York')).toBe(-300);
    expect(tzOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/New_York')).toBe(-240);
    expect(tzOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'Europe/London')).toBe(60);
    expect(tzOffsetMinutes(new Date('2026-11-23T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
  });
  it('turns a wall-clock time in a zone into the exact moment', () => {
    expect(zonedWallToInstant('2026-11-23T09:00', 'America/New_York').toISOString()).toBe('2026-11-23T14:00:00.000Z');
    expect(zonedWallToInstant('2026-07-01T09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedWallToInstant('2026-11-23T09:00', 'Asia/Tokyo').toISOString()).toBe('2026-11-23T00:00:00.000Z');
  });
  it('round-trips', () => {
    const at = new Date('2026-03-29T00:30:00Z');
    expect(zonedWallToInstant(instantToZonedWall(at, 'Europe/Paris'), 'Europe/Paris').toISOString()).toBe(at.toISOString());
    expect(instantToZonedWall(new Date('2026-11-23T14:00:00Z'), 'America/New_York')).toBe('2026-11-23T09:00');
  });
});

describe('reminders', () => {
  const e = ev({ reminders: [10, 0], start: new Date(2026, 10, 2, 9, 0).toISOString(), end: new Date(2026, 10, 2, 9, 30).toISOString() });
  it('fire once when their moment arrives', () => {
    const fired = new Set<string>();
    expect(dueReminders([e], new Date(2026, 10, 2, 8, 45), fired)).toHaveLength(0);
    const due = dueReminders([e], new Date(2026, 10, 2, 8, 51), fired);
    expect(due.map((d) => d.minutes)).toEqual([10]);
    due.forEach((d) => fired.add(d.key));
    expect(dueReminders([e], new Date(2026, 10, 2, 8, 52), fired)).toHaveLength(0);
    expect(dueReminders([e], new Date(2026, 10, 2, 9, 0), fired).map((d) => d.minutes)).toEqual([0]);
  });
  it('do not fire for old events or all-day events', () => {
    expect(dueReminders([e], new Date(2026, 10, 2, 12, 0), new Set())).toHaveLength(0);
    expect(dueReminders([{ ...e, allDay: true }], new Date(2026, 10, 2, 8, 55), new Set())).toHaveLength(0);
  });
  it('work for repeating events', () => {
    const r = { ...e, reminders: [5], repeat: { freq: 'daily' as const, interval: 1 } };
    expect(dueReminders([r], new Date(2026, 10, 4, 8, 56), new Set())).toHaveLength(1);
  });
});

import { nextDue } from '../calendar';

describe('nextDue', () => {
  it('moves daily and monthly tasks on, clamping short months', () => {
    expect(nextDue('2026-11-23', { freq: 'daily', interval: 2 })).toBe('2026-11-25');
    expect(nextDue('2026-01-31', { freq: 'monthly', interval: 1 })).toBe('2026-02-28');
    expect(nextDue('2028-02-29', { freq: 'yearly', interval: 1 })).toBe('2029-02-28');
  });
  it('picks the next chosen weekday, then wraps to the next week', () => {
    // 2026-11-23 is a Monday
    expect(nextDue('2026-11-23', { freq: 'weekly', interval: 1, byDay: [1, 3] })).toBe('2026-11-25');
    expect(nextDue('2026-11-25', { freq: 'weekly', interval: 1, byDay: [1, 3] })).toBe('2026-11-30');
    expect(nextDue('2026-11-23', { freq: 'weekly', interval: 2 })).toBe('2026-12-07');
  });
});
