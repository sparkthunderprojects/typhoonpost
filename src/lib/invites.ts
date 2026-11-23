import type { Attendee, CalendarEvent, Email, InvitePayload, RsvpStatus } from '@/types';

export const newUid = () => `${crypto.randomUUID()}@typhoonpost`;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A meeting someone else organised, as opposed to one you made or one with nobody invited. */
export const isInvitedTo = (ev: CalendarEvent, me: string) => !!ev.organizer && !same(ev.organizer.email, me);
export const isOrganiser = (ev: CalendarEvent, me: string) => !!ev.attendees?.length && (!ev.organizer || same(ev.organizer.email, me));

export function toInvite(ev: CalendarEvent, method: InvitePayload['method'], organizer: InvitePayload['organizer'], sequence = 0): InvitePayload {
  return {
    method,
    uid: ev.uid ?? '',
    sequence,
    organizer,
    attendees: ev.attendees ?? [],
    event: {
      title: ev.title, description: ev.description, location: ev.location, start: ev.start, end: ev.end, allDay: ev.allDay,
      ...(ev.tz ? { tz: ev.tz } : {}),
      ...(ev.repeat ? { repeat: ev.repeat } : {}),
      ...(ev.exdates?.length ? { exdates: ev.exdates } : {}),
      ...(ev.meetingUrl ? { meetingUrl: ev.meetingUrl } : {}),
    },
  };
}

export function replyInvite(inv: InvitePayload, me: { email: string; name?: string }, status: RsvpStatus): InvitePayload {
  return { ...inv, method: 'REPLY', response: { email: me.email, ...(me.name ? { name: me.name } : {}), status } };
}

/** The event to put on your calendar for an invitation you accepted or tentatively accepted. */
export function eventFromInvite(inv: InvitePayload, status: RsvpStatus, base?: Partial<CalendarEvent>): Omit<CalendarEvent, 'id'> {
  return {
    color: '#2563eb',
    ...base,
    ...inv.event,
    uid: inv.uid,
    organizer: inv.organizer,
    attendees: inv.attendees,
    myStatus: status,
    showAs: status === 'tentative' ? 'tentative' : 'busy',
  };
}

/** Folds a reply into the organiser's copy of the meeting. Returns null when nothing changes. */
export function applyReply(ev: CalendarEvent, inv: InvitePayload): CalendarEvent | null {
  if (inv.method !== 'REPLY' || !inv.response || !ev.attendees) return null;
  const who = inv.response.email;
  const idx = ev.attendees.findIndex((a) => same(a.email, who));
  if (idx < 0 || ev.attendees[idx].status === inv.response.status) return null;
  const attendees = ev.attendees.map((a, i) => (i === idx ? { ...a, status: inv.response!.status } : a));
  return { ...ev, attendees };
}

/** All replies in the mailbox, oldest first, so the latest answer from each person wins. */
export function pendingReplyUpdates(events: CalendarEvent[], emails: Email[]): CalendarEvent[] {
  const replies = emails
    .filter((e) => e.invite?.method === 'REPLY')
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const working = new Map(events.map((e) => [e.uid, e] as const));
  const changed = new Map<string, CalendarEvent>();
  for (const m of replies) {
    const ev = working.get(m.invite!.uid);
    if (!ev) continue;
    const next = applyReply(ev, m.invite!);
    if (next) {
      working.set(ev.uid, next);
      changed.set(ev.id, next);
    }
  }
  return [...changed.values()];
}

export function summariseResponses(attendees: Attendee[] = []): string {
  const n = (s: RsvpStatus) => attendees.filter((a) => a.status === s).length;
  const bits = [`${n('accepted')} accepted`, n('tentative') && `${n('tentative')} tentative`, n('declined') && `${n('declined')} declined`, n('needs') && `${n('needs')} no reply`].filter(Boolean);
  return bits.join(', ');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inviteSubject(inv: InvitePayload): string {
  const t = inv.event.title || '(No title)';
  if (inv.method === 'CANCEL') return `Canceled: ${t}`;
  if (inv.method === 'REPLY') {
    const word = { accepted: 'Accepted', tentative: 'Tentative', declined: 'Declined', needs: 'No reply' }[inv.response?.status ?? 'needs'];
    return `${word}: ${t}`;
  }
  return inv.sequence > 0 ? `Updated invitation: ${t}` : `Invitation: ${t}`;
}

/** Plain readable body, used by everyone who cannot show the invitation card (and for outside addresses). */
export function inviteBody(inv: InvitePayload, whenText: string): string {
  const e = inv.event;
  const lead =
    inv.method === 'CANCEL' ? `${esc(inv.organizer.name || inv.organizer.email)} canceled this meeting.`
    : inv.method === 'REPLY' ? `${esc(inv.response?.name || inv.response?.email || 'Someone')} responded: ${inv.response?.status}.`
    : `${esc(inv.organizer.name || inv.organizer.email)} invited you to a meeting.`;
  const rows = [
    `<p><strong>${esc(e.title || '(No title)')}</strong></p>`,
    `<p>${esc(whenText)}</p>`,
    e.location ? `<p>Where: ${esc(e.location)}</p>` : '',
    e.meetingUrl ? `<p>Join: ${esc(e.meetingUrl)}</p>` : '',
    e.description ? `<p>${esc(e.description).replace(/\n/g, '<br>')}</p>` : '',
  ];
  return `<p>${lead}</p>${rows.join('')}`;
}

export function describeWhen(e: Pick<CalendarEvent, 'start' | 'end' | 'allDay'>): string {
  const s = new Date(e.start);
  const en = new Date(e.end);
  const day = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (e.allDay) return s.toDateString() === en.toDateString() ? `${day(s)}, all day` : `${day(s)} to ${day(en)}`;
  return s.toDateString() === en.toDateString() ? `${day(s)}, ${time(s)} – ${time(en)}` : `${day(s)} ${time(s)} to ${day(en)} ${time(en)}`;
}
