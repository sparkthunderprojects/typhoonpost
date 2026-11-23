import { describe, expect, it } from 'vitest';
import { contactMatches, emailMatches, filterBy, taskMatches } from '../search';
import type { Contact, Email, Task } from '@/types';

const email = (over: Partial<Email>): Email => ({
  id: '1', sender: 'Zoë Nuñez', senderEmail: 'zoe@example.org', avatarColor: '#000', initials: 'ZN', subject: 'Quarterly plan',
  preview: 'p', body: '<style>.x{}</style><p>Budget for <b>Lisbon</b> offsite</p>', timestamp: '', date: '', read: true,
  starred: false, folder: 'inbox', labels: [], category: 'primary', attachments: [{ id: 'a', name: 'roadmap.pdf', size: '1 KB', kind: 'pdf' }],
  toAddresses: ['team@typhoonpost.com'], ...over,
});

describe('search', () => {
  const list = [email({}), email({ id: '2', subject: 'Lunch', body: '<p>soup</p>', attachments: [], sender: 'Bob', senderEmail: 'bob@x.io', toAddresses: [] })];
  it('finds words in the body, recipients and attachment names', () => {
    expect(filterBy(list, 'lisbon', emailMatches).map((e) => e.id)).toEqual(['1']);
    expect(filterBy(list, 'team@typhoonpost', emailMatches).map((e) => e.id)).toEqual(['1']);
    expect(filterBy(list, 'roadmap', emailMatches).map((e) => e.id)).toEqual(['1']);
  });
  it('requires every word, in any order, ignoring case and accents', () => {
    expect(filterBy(list, 'offsite BUDGET', emailMatches)).toHaveLength(1);
    expect(filterBy(list, 'zoe nunez', emailMatches)).toHaveLength(1);
    expect(filterBy(list, 'lisbon soup', emailMatches)).toHaveLength(0);
  });
  it('does not match markup or styles', () => {
    expect(filterBy(list, 'style', emailMatches)).toHaveLength(0);
    expect(filterBy(list, '<b>', emailMatches)).toHaveLength(0);
  });
  it('returns everything for an empty query', () => expect(filterBy(list, '  ', emailMatches)).toHaveLength(2));
  it('searches contacts and tasks', () => {
    const c = { id: 'c', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@x.org', phone: '', jobTitle: 'Analyst', company: 'Engine Co', avatarColor: '', notes: 'met at conf', groups: [], starred: false, frequent: false, createdAt: '' } as Contact;
    expect(contactMatches(c, ['engine', 'ada'])).toBe(true);
    const t = { id: 't', title: 'Renew passport', notes: 'photo needed', due: null, important: false, done: false, completedAt: null, createdAt: '' } as Task;
    expect(taskMatches(t, ['photo'])).toBe(true);
    expect(taskMatches(t, ['visa'])).toBe(false);
  });
});

import { emailMatchesSearch, parseSearch, searchEmails } from '../search';
import { ordered } from '../quicksteps';

describe('search operators', () => {
  const mk = (over: Record<string, unknown>) => ({
    id: 'x', sender: 'Sam Lee', senderEmail: 'sam@acme.com', subject: 'Quarterly plan', preview: 'numbers inside', body: '<p>Budget attached</p>',
    read: false, starred: false, folder: 'inbox', labels: [], attachments: [], createdAt: '2026-11-10T10:00:00Z', toAddresses: ['me@typhoonpost.com'], ...over,
  }) as never;
  const list = [
    mk({ id: 'a' }),
    mk({ id: 'b', sender: 'Jo', senderEmail: 'jo@other.org', subject: 'Lunch', read: true, starred: true, attachments: [{ name: 'menu.pdf' }], createdAt: '2026-10-01T10:00:00Z', labels: ['Work'] }),
  ];
  const ids = (q: string) => searchEmails(list as never, q).map((e) => e.id);
  it('filters by sender, subject and recipient', () => {
    expect(ids('from:acme')).toEqual(['a']);
    expect(ids('subject:lunch')).toEqual(['b']);
    expect(ids('to:typhoonpost')).toEqual(['a', 'b'].slice(0, 2).filter(() => true));
  });
  it('understands flags, attachments, dates and categories', () => {
    expect(ids('is:unread')).toEqual(['a']);
    expect(ids('is:flagged has:attachment')).toEqual(['b']);
    expect(ids('before:2026-11-01')).toEqual(['b']);
    expect(ids('after:2026-11-01')).toEqual(['a']);
    expect(ids('label:work')).toEqual(['b']);
  });
  it('combines words, phrases and exclusions', () => {
    expect(ids('"quarterly plan"')).toEqual(['a']);
    expect(ids('budget -lunch')).toEqual(['a', 'b'].filter((i) => i === 'a'));
    expect(ids('-quarterly')).toEqual(['b']);
  });
  it('reports the scope and treats unknown operators as text', () => {
    expect(parseSearch('in:all report').folder).toBe('all');
    expect(parseSearch('foo:bar').words).toEqual(['foo:bar']);
    expect(emailMatchesSearch(list[0] as never, parseSearch(''))).toBe(true);
  });
});

describe('quick step ordering', () => {
  it('runs in-place steps first and only the last move', () => {
    expect(ordered([{ type: 'archive' }, { type: 'markRead' }, { type: 'delete' }])).toEqual([{ type: 'markRead' }, { type: 'delete' }]);
  });
});
