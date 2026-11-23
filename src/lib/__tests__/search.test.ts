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
