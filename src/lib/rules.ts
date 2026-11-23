import type { Email } from '@/types';

/** A rule runs in this browser on mail that arrives while Typhoonpost is open. The server never reads your mail. */
export interface MailRule {
  id: string;
  name: string;
  enabled: boolean;
  // Conditions: every one that is filled in must match.
  from: string;
  subject: string;
  body: string;
  hasAttachment: boolean;
  importance: '' | 'high' | 'low';
  // Actions
  moveTo: string; // a folder id such as 'archive' or 'f:abc', or '' for none
  markRead: boolean;
  flag: boolean;
  pin: boolean;
  addLabel: string;
  delete: boolean;
}

export const emptyRule = (id: string): MailRule => ({
  id, name: 'New rule', enabled: true, from: '', subject: '', body: '', hasAttachment: false, importance: '',
  moveTo: '', markRead: false, flag: false, pin: false, addLabel: '', delete: false,
});

export interface AutoReply {
  enabled: boolean;
  /** YYYY-MM-DD, or '' for no start/end. */
  start: string;
  end: string;
  subject: string;
  message: string;
}

export const DEFAULT_AUTOREPLY: AutoReply = { enabled: false, start: '', end: '', subject: 'Automatic reply', message: '' };

export interface RulePatch {
  folder?: string;
  read?: boolean;
  starred?: boolean;
  pinned?: boolean;
  labels?: string[];
}

const lower = (s: string) => s.trim().toLowerCase();
const stripHtml = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

/** Entries are full addresses ("a@x.org") or whole domains ("@x.org" or "x.org"). */
export function listMatches(list: string[], address: string): boolean {
  const a = lower(address);
  const domain = a.split('@')[1] ?? '';
  return list.some((raw) => {
    const e = lower(raw);
    if (!e) return false;
    if (e.includes('@') && !e.startsWith('@')) return e === a;
    const d = e.replace(/^@/, '');
    return domain === d || domain.endsWith(`.${d}`);
  });
}

export function ruleMatches(rule: MailRule, e: Email): boolean {
  const any = rule.from || rule.subject || rule.body || rule.hasAttachment || rule.importance;
  if (!any) return false; // a rule with no condition would catch everything; never do that by accident
  if (rule.from && !`${lower(e.senderEmail)} ${lower(e.sender)}`.includes(lower(rule.from))) return false;
  if (rule.subject && !lower(e.subject).includes(lower(rule.subject))) return false;
  if (rule.body && !lower(stripHtml(e.body)).includes(lower(rule.body))) return false;
  if (rule.hasAttachment && e.attachments.length === 0) return false;
  if (rule.importance && (e.importance ?? 'normal') !== rule.importance) return false;
  return true;
}

export interface Screening {
  blocked: string[];
  safe: string[];
  rules: MailRule[];
}

/** What to do with one new message: blocked senders go to Junk, then rules run in order. */
export function decide(e: Email, s: Screening): RulePatch | null {
  const safe = listMatches(s.safe, e.senderEmail);
  if (!safe && listMatches(s.blocked, e.senderEmail)) return { folder: 'spam' };
  const patch: RulePatch = {};
  for (const r of s.rules) {
    if (!r.enabled || !ruleMatches(r, e)) continue;
    if (r.markRead) patch.read = true;
    if (r.flag) patch.starred = true;
    if (r.pin) patch.pinned = true;
    if (r.addLabel) patch.labels = [...new Set([...(patch.labels ?? e.labels), r.addLabel])];
    if (r.delete) patch.folder = 'trash';
    else if (r.moveTo) patch.folder = r.moveTo;
    if (patch.folder) break; // once a rule files the message elsewhere, later rules do not see it
  }
  return Object.keys(patch).length ? patch : null;
}

const MACHINE = /(^|[._-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|notifications?)([._@-]|$)/i;

export function shouldAutoReply(
  e: Email,
  ar: AutoReply,
  opts: { now: Date; myAddress: string; lastReplied?: string; minGapDays?: number },
): boolean {
  if (!ar.enabled || !ar.message.trim()) return false;
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = day(opts.now);
  if (ar.start && today < ar.start) return false;
  if (ar.end && today > ar.end) return false;
  if (lower(e.senderEmail) === lower(opts.myAddress) || !e.senderEmail) return false;
  if (MACHINE.test(e.senderEmail) || /^automatic reply/i.test(e.subject.trim())) return false;
  if (e.category !== 'primary') return false;
  if (opts.lastReplied) {
    const gap = (opts.minGapDays ?? 4) * 86400000;
    if (opts.now.getTime() - new Date(opts.lastReplied).getTime() < gap) return false;
  }
  return true;
}
