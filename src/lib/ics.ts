import type { Attendee, CalendarEvent, Repeat, RsvpStatus } from '@/types';
import { dateKey, localTz, zonedWallToInstant } from '@/lib/calendar';

export type ParsedEvent = Omit<CalendarEvent, 'id'>;

const pad = (n: number) => String(n).padStart(2, '0');

// ---- Reading ----

interface Line { name: string; params: Record<string, string>; value: string }

function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n').filter((l) => l.trim());
}

function parseLine(raw: string): Line | null {
  const colon = (() => {
    let quoted = false;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '"') quoted = !quoted;
      else if (raw[i] === ':' && !quoted) return i;
    }
    return -1;
  })();
  if (colon < 0) return null;
  const [name, ...ps] = raw.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const p of ps) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: raw.slice(colon + 1) };
}

const unescapeText = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** The common Windows zone names Outlook writes, mapped to the standard ones. */
const WINDOWS_ZONES: Record<string, string> = {
  'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest', 'Central European Standard Time': 'Europe/Warsaw', 'E. Europe Standard Time': 'Europe/Chisinau',
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles', 'Alaskan Standard Time': 'America/Anchorage', 'Hawaiian Standard Time': 'Pacific/Honolulu',
  'India Standard Time': 'Asia/Kolkata', 'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'UTC': 'UTC', 'Russian Standard Time': 'Europe/Moscow', 'Arabian Standard Time': 'Asia/Dubai',
};

function validZone(tz?: string): string | undefined {
  if (!tz) return undefined;
  const name = WINDOWS_ZONES[tz] ?? tz;
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return name;
  } catch {
    return undefined;
  }
}

interface When { date: Date; allDay: boolean; tz?: string }

function parseWhen(line: Line): When | null {
  const m = line.value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h === undefined || line.params.VALUE === 'DATE') return { date: new Date(+y, +mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)), allDay: false };
  const zone = validZone(line.params.TZID);
  if (zone) return { date: zonedWallToInstant(`${y}-${mo}-${d}T${h}:${mi}`, zone), allDay: false, tz: zone };
  return { date: new Date(+y, +mo - 1, +d, +h, +mi), allDay: false }; // floating: the viewer's own clock
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function parseRule(value: string): { repeat?: Repeat; approximated: boolean } {
  const parts: Record<string, string> = {};
  for (const kv of value.split(';')) {
    const [k, v] = kv.split('=');
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = ({ DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' } as Record<string, Repeat['freq']>)[parts.FREQ ?? ''];
  if (!freq) return { approximated: true };
  const repeat: Repeat = { freq, interval: Math.max(1, Number(parts.INTERVAL) || 1) };
  let approximated = false;
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2).toUpperCase())).filter((d) => d >= 0);
    if (freq === 'weekly') repeat.byDay = days;
    else approximated = true; // "second Tuesday of the month" is not supported; it becomes the same date each month
  }
  if (parts.BYMONTHDAY && !/^\d+$/.test(parts.BYMONTHDAY)) approximated = true;
  if (parts.BYSETPOS) approximated = true;
  if (parts.UNTIL) {
    const m = parts.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) repeat.until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (parts.COUNT && Number(parts.COUNT) > 0) repeat.count = Number(parts.COUNT);
  return { repeat, approximated };
}

function minutesFromTrigger(v: string): number | null {
  const m = v.trim().match(/^-P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m) return v.trim() === 'PT0S' ? 0 : null;
  return (+(m[1] ?? 0)) * 10080 + (+(m[2] ?? 0)) * 1440 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0);
}

export interface ParseResult { events: ParsedEvent[]; approximated: number; skipped: number }

export function parseIcs(text: string, color = '#2563eb'): ParseResult {
  const lines = unfold(text);
  const events: ParsedEvent[] = [];
  let approximated = 0;
  let skipped = 0;
  let cur: Line[] | null = null;
  let alarmDepth = 0;
  for (const raw of lines) {
    const l = parseLine(raw);
    if (!l) continue;
    if (l.name === 'BEGIN' && l.value.toUpperCase() === 'VEVENT') { cur = []; alarmDepth = 0; continue; }
    if (!cur) continue;
    if (l.name === 'BEGIN' && l.value.toUpperCase() === 'VALARM') { alarmDepth++; cur.push({ ...l, name: 'ALARM-BEGIN' }); continue; }
    if (l.name === 'END' && l.value.toUpperCase() === 'VALARM') { alarmDepth--; continue; }
    if (l.name === 'END' && l.value.toUpperCase() === 'VEVENT') {
      const ev = build(cur, color);
      if (ev) { events.push(ev.event); if (ev.approximated) approximated++; } else skipped++;
      cur = null;
      continue;
    }
    cur.push(alarmDepth > 0 ? { ...l, name: `ALARM-${l.name}` } : l);
  }
  return { events, approximated, skipped };
}

function build(lines: Line[], color: string): { event: ParsedEvent; approximated: boolean } | null {
  const get = (n: string) => lines.find((l) => l.name === n);
  const ds = get('DTSTART');
  const start = ds && parseWhen(ds);
  if (!start || Number.isNaN(start.date.getTime())) return null;
  const de = get('DTEND');
  const dur = get('DURATION');
  let endDate: Date;
  const endWhen = de && parseWhen(de);
  if (endWhen && !Number.isNaN(endWhen.date.getTime())) {
    endDate = start.allDay ? new Date(endWhen.date.getFullYear(), endWhen.date.getMonth(), endWhen.date.getDate() - 1, 23, 59) : endWhen.date;
  } else if (dur) {
    const m = dur.value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
    const mins = m ? (+(m[1] ?? 0)) * 10080 + (+(m[2] ?? 0)) * 1440 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0) : 60;
    endDate = new Date(start.date.getTime() + mins * 60000);
  } else {
    endDate = start.allDay ? new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate(), 23, 59) : new Date(start.date.getTime() + 3600000);
  }
  if (endDate < start.date) endDate = new Date(start.date.getTime() + 3600000);

  const rule = get('RRULE') ? parseRule(get('RRULE')!.value) : undefined;
  const exdates = lines
    .filter((l) => l.name === 'EXDATE')
    .flatMap((l) => l.value.split(',').map((v) => parseWhen({ ...l, value: v })))
    .filter((w): w is When => !!w)
    .map((w) => dateKey(w.date));
  const reminders = lines
    .filter((l) => l.name === 'ALARM-TRIGGER')
    .map((l) => minutesFromTrigger(l.value))
    .filter((m): m is number => m !== null && m <= 10080);

  const attendees: Attendee[] = lines
    .filter((l) => l.name === 'ATTENDEE')
    .map((l) => ({
      email: l.value.replace(/^mailto:/i, '').trim().toLowerCase(),
      ...(l.params.CN ? { name: l.params.CN } : {}),
      role: l.params.ROLE === 'OPT-PARTICIPANT' ? ('optional' as const) : ('required' as const),
      status: (({ ACCEPTED: 'accepted', TENTATIVE: 'tentative', DECLINED: 'declined' } as Record<string, RsvpStatus>)[l.params.PARTSTAT ?? ''] ?? 'needs') as RsvpStatus,
    }))
    .filter((a) => a.email.includes('@'));
  const org = get('ORGANIZER');
  const transp = get('TRANSP')?.value.toUpperCase();

  const event: ParsedEvent = {
    title: unescapeText(get('SUMMARY')?.value ?? '') || '(No title)',
    description: unescapeText(get('DESCRIPTION')?.value ?? ''),
    location: unescapeText(get('LOCATION')?.value ?? ''),
    start: start.date.toISOString(),
    end: endDate.toISOString(),
    allDay: start.allDay,
    color,
    ...(get('UID') ? { uid: get('UID')!.value.trim() } : {}),
    ...(rule?.repeat ? { repeat: rule.repeat } : {}),
    ...(exdates.length ? { exdates } : {}),
    ...(reminders.length ? { reminders: [...new Set(reminders)] } : {}),
    ...(start.tz && !start.allDay ? { tz: start.tz } : {}),
    ...(get('CLASS')?.value.toUpperCase() === 'PRIVATE' ? { visibility: 'private' as const } : {}),
    ...(transp === 'TRANSPARENT' ? { showAs: 'free' as const } : {}),
    ...(org ? { organizer: { name: org.params.CN ?? '', email: org.value.replace(/^mailto:/i, '').trim().toLowerCase() } } : {}),
    ...(attendees.length ? { attendees } : {}),
  };
  return { event, approximated: !!rule?.approximated };
}

// ---- Writing ----

const escapeText = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const dayStamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const wall = (d: Date) => `${dayStamp(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

function rule(r: Repeat): string {
  const f = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.freq];
  const parts = [`FREQ=${f}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly' && r.byDay?.length) parts.push(`BYDAY=${r.byDay.map((d) => DAYS[d]).join(',')}`);
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}`);
  if (r.count) parts.push(`COUNT=${r.count}`);
  return parts.join(';');
}

export function toIcs(events: CalendarEvent[], opts: { name?: string; method?: 'REQUEST' | 'CANCEL' | 'PUBLISH'; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const out: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Typhoonpost//Calendar//EN', 'CALSCALE:GREGORIAN'];
  if (opts.method) out.push(`METHOD:${opts.method}`);
  if (opts.name) out.push(`X-WR-CALNAME:${escapeText(opts.name)}`);
  for (const ev of events) {
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    out.push('BEGIN:VEVENT', `UID:${ev.uid ?? `${ev.id}@typhoonpost`}`, `DTSTAMP:${utc(now)}`);
    if (ev.allDay) {
      out.push(`DTSTART;VALUE=DATE:${dayStamp(s)}`, `DTEND;VALUE=DATE:${dayStamp(new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1))}`);
    } else if (ev.repeat) {
      const tz = localTz();
      out.push(`DTSTART;TZID=${tz}:${wall(s)}`, `DTEND;TZID=${tz}:${wall(e)}`);
    } else {
      out.push(`DTSTART:${utc(s)}`, `DTEND:${utc(e)}`);
    }
    if (ev.repeat) out.push(`RRULE:${rule(ev.repeat)}`);
    for (const x of ev.exdates ?? []) {
      const d = new Date(`${x}T00:00:00`);
      out.push(ev.allDay ? `EXDATE;VALUE=DATE:${dayStamp(d)}` : `EXDATE;TZID=${localTz()}:${dayStamp(d)}T${pad(s.getHours())}${pad(s.getMinutes())}00`);
    }
    out.push(`SUMMARY:${escapeText(ev.title)}`);
    if (ev.description) out.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) out.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.meetingUrl) out.push(`URL:${ev.meetingUrl}`);
    out.push(`TRANSP:${ev.showAs === 'free' ? 'TRANSPARENT' : 'OPAQUE'}`);
    if (ev.visibility === 'private') out.push('CLASS:PRIVATE');
    if (ev.organizer) out.push(`ORGANIZER;CN=${escapeText(ev.organizer.name || ev.organizer.email)}:mailto:${ev.organizer.email}`);
    for (const a of ev.attendees ?? []) {
      const ps = { accepted: 'ACCEPTED', tentative: 'TENTATIVE', declined: 'DECLINED', needs: 'NEEDS-ACTION' }[a.status];
      out.push(`ATTENDEE;CN=${escapeText(a.name || a.email)};ROLE=${a.role === 'optional' ? 'OPT-PARTICIPANT' : 'REQ-PARTICIPANT'};PARTSTAT=${ps}:mailto:${a.email}`);
    }
    for (const m of ev.reminders ?? []) {
      out.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(ev.title)}`, m === 0 ? 'TRIGGER:PT0S' : `TRIGGER:-PT${m}M`, 'END:VALARM');
    }
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.map(fold).join('\r\n') + '\r\n';
}
