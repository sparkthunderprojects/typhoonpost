import { describe, expect, it } from 'vitest';
import { decide, emptyRule, listMatches, ruleMatches, shouldAutoReply, DEFAULT_AUTOREPLY } from '../rules';
import type { Email } from '../../types';

const mail = (over: Partial<Email> = {}): Email => ({
  id: '1', sender: 'Ada Lovelace', senderEmail: 'ada@news.example.org', avatarColor: '#000', initials: 'A', subject: 'Weekly Report',
  preview: '', body: '<p>Quarterly numbers</p>', timestamp: '', date: '', read: false, starred: false, folder: 'inbox', labels: [],
  category: 'primary', attachments: [], ...over,
});
const rule = (over: Partial<ReturnType<typeof emptyRule>>) => ({ ...emptyRule('r'), ...over });

describe('sender lists', () => {
  it('match addresses, domains and subdomains', () => {
    expect(listMatches(['ada@news.example.org'], 'ADA@news.example.org')).toBe(true);
    expect(listMatches(['@example.org'], 'ada@news.example.org')).toBe(true);
    expect(listMatches(['example.org'], 'ada@example.org')).toBe(true);
    expect(listMatches(['example.org'], 'ada@notexample.org')).toBe(false);
    expect(listMatches(['bob@example.org'], 'ada@example.org')).toBe(false);
    expect(listMatches([''], 'ada@example.org')).toBe(false);
  });
});

describe('rules', () => {
  it('a rule with no condition matches nothing', () => {
    expect(ruleMatches(rule({ markRead: true }), mail())).toBe(false);
  });
  it('all filled conditions must match, ignoring case and markup', () => {
    expect(ruleMatches(rule({ from: 'LOVELACE', subject: 'report', body: 'quarterly' }), mail())).toBe(true);
    expect(ruleMatches(rule({ from: 'ada', subject: 'invoice' }), mail())).toBe(false);
    expect(ruleMatches(rule({ hasAttachment: true, from: 'ada' }), mail())).toBe(false);
    expect(ruleMatches(rule({ importance: 'high' }), mail({ importance: 'high' }))).toBe(true);
    expect(ruleMatches(rule({ importance: 'high' }), mail())).toBe(false);
  });
  it('applies actions, and a filing rule stops later ones', () => {
    const rules = [
      rule({ id: 'a', from: 'ada', markRead: true, addLabel: 'c:x' }),
      rule({ id: 'b', from: 'ada', moveTo: 'archive' }),
      rule({ id: 'c', from: 'ada', flag: true }),
    ];
    expect(decide(mail(), { blocked: [], safe: [], rules })).toEqual({ read: true, labels: ['c:x'], folder: 'archive' });
  });
  it('delete beats move, disabled rules are skipped, no match gives null', () => {
    expect(decide(mail(), { blocked: [], safe: [], rules: [rule({ from: 'ada', delete: true, moveTo: 'archive' })] })).toEqual({ folder: 'trash' });
    expect(decide(mail(), { blocked: [], safe: [], rules: [rule({ from: 'ada', flag: true, enabled: false })] })).toBeNull();
    expect(decide(mail(), { blocked: [], safe: [], rules: [] })).toBeNull();
  });
  it('blocked senders go to Junk unless marked safe', () => {
    expect(decide(mail(), { blocked: ['@example.org'], safe: [], rules: [] })).toEqual({ folder: 'spam' });
    expect(decide(mail(), { blocked: ['@example.org'], safe: ['ada@news.example.org'], rules: [] })).toBeNull();
  });
});

describe('auto reply', () => {
  const ar = { ...DEFAULT_AUTOREPLY, enabled: true, message: 'Away', start: '2026-11-20', end: '2026-11-30' };
  const base = { now: new Date(2026, 10, 25, 12), myAddress: 'me@typhoonpost.com' };
  it('replies inside the dates to a real sender', () => {
    expect(shouldAutoReply(mail(), ar, base)).toBe(true);
  });
  it('not outside the dates, when off, or with no message', () => {
    expect(shouldAutoReply(mail(), ar, { ...base, now: new Date(2026, 11, 2) })).toBe(false);
    expect(shouldAutoReply(mail(), ar, { ...base, now: new Date(2026, 10, 19) })).toBe(false);
    expect(shouldAutoReply(mail(), { ...ar, enabled: false }, base)).toBe(false);
    expect(shouldAutoReply(mail(), { ...ar, message: '  ' }, base)).toBe(false);
  });
  it('never to yourself, machines, other automatic replies or promotions', () => {
    expect(shouldAutoReply(mail({ senderEmail: 'ME@typhoonpost.com' }), ar, base)).toBe(false);
    expect(shouldAutoReply(mail({ senderEmail: 'noreply@x.org' }), ar, base)).toBe(false);
    expect(shouldAutoReply(mail({ senderEmail: 'mailer-daemon@x.org' }), ar, base)).toBe(false);
    expect(shouldAutoReply(mail({ subject: 'Automatic reply: Hi' }), ar, base)).toBe(false);
    expect(shouldAutoReply(mail({ category: 'promotions' }), ar, base)).toBe(false);
  });
  it('once per sender within the gap', () => {
    expect(shouldAutoReply(mail(), ar, { ...base, lastReplied: new Date(2026, 10, 24).toISOString() })).toBe(false);
    expect(shouldAutoReply(mail(), ar, { ...base, lastReplied: new Date(2026, 10, 20).toISOString() })).toBe(true);
  });
});
