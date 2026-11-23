import { describe, expect, it } from 'vitest';
import { applyReply, eventFromInvite, inviteSubject, isInvitedTo, isOrganiser, pendingReplyUpdates, replyInvite, toInvite } from '../invites';
import type { CalendarEvent, Email } from '../../types';

const ev: CalendarEvent = {
  id: 'e1', uid: 'u1', title: 'Review', description: '', location: 'Room', start: '2026-12-01T10:00:00Z', end: '2026-12-01T11:00:00Z', allDay: false, color: '#000',
  organizer: { name: 'Me', email: 'me@typhoonpost.com' },
  attendees: [{ email: 'a@x.com', role: 'required', status: 'needs' }, { email: 'b@x.com', role: 'optional', status: 'needs' }],
};
const me = { email: 'me@typhoonpost.com', name: 'Me' };
const reply = (from: string, status: 'accepted' | 'declined' | 'tentative', at: string): Email =>
  ({ id: `${from}${at}`, createdAt: at, invite: replyInvite(toInvite(ev, 'REQUEST', me), { email: from }, status) }) as unknown as Email;

describe('invitations', () => {
  it('tells organiser from invitee', () => {
    expect(isOrganiser(ev, 'ME@typhoonpost.com')).toBe(true);
    expect(isInvitedTo(ev, 'a@x.com')).toBe(true);
    expect(isInvitedTo(ev, 'me@typhoonpost.com')).toBe(false);
  });
  it('turns an accepted invitation into a calendar event with the right status', () => {
    const inv = toInvite(ev, 'REQUEST', me);
    const mine = eventFromInvite(inv, 'tentative');
    expect(mine.uid).toBe('u1');
    expect(mine.myStatus).toBe('tentative');
    expect(mine.showAs).toBe('tentative');
    expect(mine.organizer?.email).toBe('me@typhoonpost.com');
  });
  it('records a reply from the right attendee only', () => {
    const r = reply('A@x.com', 'accepted', '2026-11-24T00:00:00Z');
    const next = applyReply(ev, r.invite!)!;
    expect(next.attendees![0].status).toBe('accepted');
    expect(next.attendees![1].status).toBe('needs');
    expect(applyReply(next, r.invite!)).toBeNull();
    expect(applyReply(ev, reply('stranger@x.com', 'accepted', '2026-11-24T00:00:00Z').invite!)).toBeNull();
  });
  it('the latest answer from each person wins', () => {
    const out = pendingReplyUpdates([ev], [
      reply('a@x.com', 'declined', '2026-11-25T00:00:00Z'),
      reply('a@x.com', 'accepted', '2026-11-24T00:00:00Z'),
      reply('b@x.com', 'tentative', '2026-11-24T05:00:00Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].attendees!.map((a) => a.status)).toEqual(['declined', 'tentative']);
  });
  it('writes Outlook-style subjects', () => {
    expect(inviteSubject(toInvite(ev, 'REQUEST', me))).toBe('Invitation: Review');
    expect(inviteSubject(toInvite(ev, 'REQUEST', me, 1))).toBe('Updated invitation: Review');
    expect(inviteSubject(toInvite(ev, 'CANCEL', me))).toBe('Canceled: Review');
    expect(inviteSubject(reply('a@x.com', 'declined', '2026-11-24T00:00:00Z').invite!)).toBe('Declined: Review');
  });
});
