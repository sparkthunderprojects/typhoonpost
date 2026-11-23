import { describe, expect, it } from 'vitest';
import { conversationOf, groupThreads, isFocused, normalizeSubject, threadKey } from '../thread';
import { fileNameFor, printHtml, toEml } from '../export';
import type { Email } from '../../types';

const mail = (over: Partial<Email>): Email => ({
  id: 'x', sender: 'Ada', senderEmail: 'ada@x.org', avatarColor: '#000', initials: 'A', subject: 'Budget', preview: '', body: '<p>hi</p>',
  timestamp: '', date: '', read: true, starred: false, folder: 'inbox', labels: [], category: 'primary', attachments: [],
  createdAt: '2026-11-20T10:00:00Z', ...over,
});

describe('threading', () => {
  it('normalises prefixes in several languages and repeats', () => {
    expect(normalizeSubject('Re: RE: Fwd:  Budget  plan ')).toBe('budget plan');
    expect(normalizeSubject('AW: Sv: Budget')).toBe('budget');
    expect(normalizeSubject('Re[2]: Budget')).toBe('budget');
    expect(normalizeSubject('Reply to budget')).toBe('reply to budget');
  });
  it('never joins messages without a subject', () => {
    expect(threadKey({ subject: '' })).toBe('');
    expect(threadKey({ subject: '(No subject)' })).toBe('');
    const g = groupThreads([mail({ id: '1', subject: '' }), mail({ id: '2', subject: '' })]);
    expect(g).toHaveLength(2);
  });
  it('groups by subject, keeping list order and counting unread', () => {
    const g = groupThreads([
      mail({ id: '1', subject: 'Re: Budget', read: false }),
      mail({ id: '2', subject: 'Lunch' }),
      mail({ id: '3', subject: 'Budget', read: false }),
      mail({ id: '4', subject: 'RE: budget' }),
    ]);
    expect(g.map((x) => x.head.id)).toEqual(['1', '2']);
    expect(g[0].items.map((e) => e.id)).toEqual(['1', '3', '4']);
    expect(g[0].unread).toBe(2);
  });
  it('conversation spans folders, skips bin, junk and drafts, oldest first', () => {
    const all = [
      mail({ id: 'a', createdAt: '2026-11-22T00:00:00Z' }),
      mail({ id: 'b', subject: 'Re: Budget', folder: 'sent', createdAt: '2026-11-21T00:00:00Z' }),
      mail({ id: 'c', folder: 'trash' }),
      mail({ id: 'd', folder: 'drafts' }),
      mail({ id: 'e', subject: 'Other' }),
    ];
    expect(conversationOf(all[0], all).map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('focused overrides', () => {
  it('a chosen sender beats the automatic category', () => {
    const e = mail({ category: 'promotions', senderEmail: 'News@X.org' });
    expect(isFocused(e, {})).toBe(false);
    expect(isFocused(e, { 'news@x.org': 'focused' })).toBe(true);
    expect(isFocused(mail({}), { 'ada@x.org': 'other' })).toBe(false);
  });
});

describe('export', () => {
  it('writes a standards-shaped .eml with an encoded subject and base64 body', () => {
    const eml = toEml(mail({ id: 'abc', subject: 'Café ☕', toAddresses: ['b@x.org'], ccAddresses: ['c@x.org'], importance: 'high' }));
    expect(eml).toContain('From: "Ada" <ada@x.org>');
    expect(eml).toContain('To: b@x.org');
    expect(eml).toContain('Cc: c@x.org');
    expect(eml).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(eml).toContain('Importance: high');
    expect(eml).toContain('Message-ID: <abc@typhoonpost.local>');
    const body = eml.split('\r\n\r\n')[1].replace(/\s/g, '');
    expect(atob(body)).toBe('<p>hi</p>');
  });
  it('never writes Bcc', () => {
    expect(toEml(mail({ bccAddresses: ['secret@x.org'] }))).not.toContain('secret@x.org');
  });
  it('cleans names for file names and escapes the print page', () => {
    expect(fileNameFor({ subject: 'Q4: plan/draft?' }, 'eml')).toBe('Q4 plandraft.eml');
    const html = printHtml(mail({ subject: '<script>', sender: '<b>' }), () => '<p>x</p>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
