import { describe, expect, it } from 'vitest';
import { parseIcs, toIcs } from '../ics';
import { dateKey } from '../calendar';
import type { CalendarEvent } from '../../types';

const SAMPLE = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:abc-1', 'DTSTART;TZID=Europe/London:20261201T090000', 'DTEND;TZID=Europe/London:20261201T100000',
  'SUMMARY:Planning\\, weekly', 'DESCRIPTION:Line one\\nLine two', 'LOCATION:Room 4',
  'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6', 'EXDATE;TZID=Europe/London:20261214T090000',
  'ORGANIZER;CN=Sam:mailto:sam@example.com', 'ATTENDEE;CN=Jo;ROLE=OPT-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:Jo@Example.com',
  'TRANSP:TRANSPARENT', 'CLASS:PRIVATE',
  'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:abc-2', 'DTSTART;VALUE=DATE:20261224', 'DTEND;VALUE=DATE:20261226', 'SUMMARY:Holiday', 'END:VEVENT',
  'BEGIN:VEVENT', 'SUMMARY:Broken', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcs', () => {
  const { events, skipped } = parseIcs(SAMPLE);
  it('reads text, zone, repeat, attendees and reminders', () => {
    const e = events[0];
    expect(e.title).toBe('Planning, weekly');
    expect(e.description).toBe('Line one\nLine two');
    expect(e.start).toBe('2026-12-01T09:00:00.000Z'); // London is on UTC in December
    expect(e.tz).toBe('Europe/London');
    expect(e.repeat).toEqual({ freq: 'weekly', interval: 2, byDay: [1, 3], count: 6 });
    expect(e.exdates).toEqual(['2026-12-14']);
    expect(e.reminders).toEqual([15]);
    expect(e.showAs).toBe('free');
    expect(e.visibility).toBe('private');
    expect(e.organizer).toEqual({ name: 'Sam', email: 'sam@example.com' });
    expect(e.attendees).toEqual([{ email: 'jo@example.com', name: 'Jo', role: 'optional', status: 'accepted' }]);
  });
  it('treats all-day end dates as exclusive and skips events with no start', () => {
    const h = events[1];
    expect(h.allDay).toBe(true);
    expect(dateKey(new Date(h.start))).toBe('2026-12-24');
    expect(dateKey(new Date(h.end))).toBe('2026-12-25');
    expect(skipped).toBe(1);
  });
  it('understands Outlook zone names and UTC times', () => {
    const r = parseIcs('BEGIN:VEVENT\nDTSTART;TZID=Pacific Standard Time:20261201T090000\nDTEND:20261201T190000Z\nSUMMARY:x\nEND:VEVENT');
    expect(r.events[0].start).toBe('2026-12-01T17:00:00.000Z');
    expect(r.events[0].tz).toBe('America/Los_Angeles');
  });
  it('flags rules it can only approximate', () => {
    const r = parseIcs('BEGIN:VEVENT\nDTSTART:20261201T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=2TU\nSUMMARY:x\nEND:VEVENT');
    expect(r.approximated).toBe(1);
    expect(r.events[0].repeat?.freq).toBe('monthly');
  });
  it('joins folded lines', () => {
    const r = parseIcs('BEGIN:VEVENT\nDTSTART:20261201T090000Z\nSUMMARY:A very long\n  title\nEND:VEVENT');
    expect(r.events[0].title).toBe('A very long title');
  });
});

describe('toIcs', () => {
  const ev: CalendarEvent = {
    id: 'e1', title: 'Lunch; with, Sam', description: 'a\nb', location: 'Cafe', start: '2026-12-01T12:00:00.000Z', end: '2026-12-01T13:00:00.000Z',
    allDay: false, color: '#000', reminders: [10], showAs: 'free',
    attendees: [{ email: 'sam@example.com', name: 'Sam', role: 'required', status: 'needs' }], organizer: { name: 'Me', email: 'me@typhoonpost.com' },
  };
  it('writes a valid calendar that reads back the same', () => {
    const text = toIcs([ev], { now: new Date('2026-11-23T00:00:00Z') });
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('DTSTART:20261201T120000Z');
    expect(text).toContain('SUMMARY:Lunch\; with\\, Sam');
    expect(text.split('\r\n').every((l) => l.length <= 75)).toBe(true);
    const back = parseIcs(text).events[0];
    expect(back.title).toBe(ev.title);
    expect(back.description).toBe('a\nb');
    expect(back.start).toBe(ev.start);
    expect(back.reminders).toEqual([10]);
    expect(back.showAs).toBe('free');
    expect(back.attendees?.[0].email).toBe('sam@example.com');
  });
  it('round-trips a repeating all-day event', () => {
    const a: CalendarEvent = { ...ev, id: 'a', allDay: true, start: new Date(2026, 11, 24).toISOString(), end: new Date(2026, 11, 25, 23, 59).toISOString(), repeat: { freq: 'yearly', interval: 1 }, reminders: undefined, attendees: undefined };
    const back = parseIcs(toIcs([a])).events[0];
    expect(back.allDay).toBe(true);
    expect(back.repeat).toEqual({ freq: 'yearly', interval: 1 });
    expect(dateKey(new Date(back.end))).toBe('2026-12-25');
  });
});
