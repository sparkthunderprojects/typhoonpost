import { describe, expect, it } from 'vitest';
import { buildReply, prefixSubject } from '../reply';
import { splitRecipients } from '../recipients';
import { followUpDay, followUpTimestamp } from '../followup';
import type { Email } from '../../types';

const mail = (over: Partial<Email> = {}): Email => ({
  id: '1', sender: 'Ada Lovelace', senderEmail: 'ada@example.org', avatarColor: '#000', initials: 'AL',
  subject: 'Budget', preview: '', body: '<p>Hello team</p>', timestamp: '', date: '', read: true, starred: false,
  folder: 'inbox', labels: [], category: 'primary', attachments: [{ id: 'a', name: 'f.pdf', size: '1 KB', kind: 'pdf' }],
  toAddresses: ['me@typhoonpost.com', 'bob@example.org'], ccAddresses: ['cy@example.org'],
  createdAt: '2026-11-20T10:00:00Z', ...over,
});

describe('subjects', () => {
  it('adds a prefix once', () => {
    expect(prefixSubject('Budget', 'reply')).toBe('Re: Budget');
    expect(prefixSubject('RE: Budget', 'reply')).toBe('RE: Budget');
    expect(prefixSubject('Budget', 'forward')).toBe('Fwd: Budget');
    expect(prefixSubject('Fw: Budget', 'forward')).toBe('Fwd: Budget');
    expect(prefixSubject('Fwd: Budget', 'forward')).toBe('Fwd: Budget');
  });
});

describe('buildReply', () => {
  it('replies to the sender only', () => {
    const r = buildReply(mail(), 'reply', 'me@typhoonpost.com');
    expect(r.to).toEqual(['ada@example.org']);
    expect(r.cc).toEqual([]);
    expect(r.subject).toBe('Re: Budget');
    expect(r.body).toContain('<blockquote><p>Hello team</p></blockquote>');
    expect(r.body).toContain('Ada Lovelace &lt;ada@example.org&gt; wrote:');
    expect(r.keepAttachments).toBe(false);
  });

  it('reply all keeps everyone except me', () => {
    const r = buildReply(mail(), 'replyAll', 'ME@typhoonpost.com');
    expect(r.to).toEqual(['ada@example.org']);
    expect(r.cc).toEqual(['bob@example.org', 'cy@example.org']);
  });

  it('does not repeat the sender in Cc', () => {
    const r = buildReply(mail({ toAddresses: ['me@typhoonpost.com', 'ada@example.org'] }), 'replyAll', 'me@typhoonpost.com');
    expect(r.cc).toEqual(['cy@example.org']);
  });

  it('replying to a message I sent goes to its recipients', () => {
    const sent = mail({ folder: 'sent', senderEmail: 'me@typhoonpost.com', toAddresses: ['bob@example.org'], ccAddresses: ['cy@example.org'] });
    expect(buildReply(sent, 'reply', 'me@typhoonpost.com').to).toEqual(['bob@example.org']);
    const all = buildReply(sent, 'replyAll', 'me@typhoonpost.com');
    expect(all.to).toEqual(['bob@example.org']);
    expect(all.cc).toEqual(['cy@example.org']);
  });

  it('falls back to the sender when nobody else is left', () => {
    const self = mail({ senderEmail: 'me@typhoonpost.com', toAddresses: ['me@typhoonpost.com'], ccAddresses: [] });
    expect(buildReply(self, 'reply', 'me@typhoonpost.com').to).toEqual(['me@typhoonpost.com']);
  });

  it('forward has no recipients, keeps files and shows the original header', () => {
    const r = buildReply(mail(), 'forward', 'me@typhoonpost.com');
    expect(r.to).toEqual([]);
    expect(r.cc).toEqual([]);
    expect(r.subject).toBe('Fwd: Budget');
    expect(r.keepAttachments).toBe(true);
    expect(r.body).toContain('Forwarded message');
    expect(r.body).toContain('<b>Subject:</b> Budget');
    expect(r.body).not.toContain('<blockquote>');
  });

  it('escapes names and runs the cleaner over the quoted body', () => {
    const r = buildReply(mail({ sender: '<b>x</b>', subject: 'a<script>' }), 'forward', 'me@typhoonpost.com', () => '<p>clean</p>');
    expect(r.body).not.toContain('<b>x</b>');
    expect(r.body).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(r.body).toContain('a&lt;script&gt;');
    expect(r.body).toContain('<p>clean</p>');
  });
});

describe('splitRecipients', () => {
  it('keeps each address at its most visible level', () => {
    const r = splitRecipients('A <a@x.org>, b@x.org', 'b@x.org; c@x.org', 'a@x.org, c@x.org, d@x.org');
    expect(r.toList).toEqual(['a@x.org', 'b@x.org']);
    expect(r.ccList).toEqual(['c@x.org']);
    expect(r.bccList).toEqual(['d@x.org']);
    expect(r.all).toEqual(['a@x.org', 'b@x.org', 'c@x.org', 'd@x.org']);
  });
});

describe('follow-up days', () => {
  const wed = new Date(2026, 10, 25, 15, 0); // Wed 25 Nov 2026
  it('quick options', () => {
    expect(followUpDay('today', wed)).toBe('2026-11-25');
    expect(followUpDay('tomorrow', wed)).toBe('2026-11-26');
    expect(followUpDay('this-week', wed)).toBe('2026-11-27');
    expect(followUpDay('next-week', wed)).toBe('2026-11-30');
  });
  it('rolls over at the end of the week', () => {
    expect(followUpDay('this-week', new Date(2026, 10, 27))).toBe('2026-12-04');
    expect(followUpDay('next-week', new Date(2026, 10, 29))).toBe('2026-11-30'); // from a Sunday
    expect(followUpDay('next-week', new Date(2026, 11, 31))).toBe('2027-01-04'); // across the year
  });
  it('timestamp is nine in the morning local time', () => {
    const d = new Date(followUpTimestamp('2026-11-27'));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 27, 9]);
  });
});

import { previewOf } from '../preview';
describe('previewOf', () => {
  it('flattens HTML and decodes entities', () => {
    expect(previewOf('<p>From: Ann &lt;a@x.org&gt;</p><p>Hi&nbsp;there</p>')).toBe('From: Ann <a@x.org> Hi there');
    expect(previewOf('<p></p>')).toBe('(no content)');
  });
});
