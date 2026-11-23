import type { CalendarEvent, Contact, Email, Task } from '@/types';

/**
 * Search runs entirely in the browser over data that has already been decrypted for this session.
 * Nothing about what is searched for, or what it matches, is sent anywhere. The text each item is
 * searched on is built once and remembered for as long as that item object stays in memory.
 */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function tokens(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

const cache = new WeakMap<object, string>();
function memo<T extends object>(item: T, build: (x: T) => string): string {
  let text = cache.get(item);
  if (text === undefined) {
    text = fold(build(item));
    cache.set(item, text);
  }
  return text;
}

function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Every word typed has to appear somewhere in the item, in any order. */
const all = (text: string, words: string[]) => words.every((w) => text.includes(w));

export const emailMatches = (e: Email, words: string[]) =>
  all(
    memo(e, (m) =>
      [m.sender, m.senderEmail, m.subject, m.preview, stripHtml(m.body), (m.toAddresses ?? []).join(' '), m.attachments.map((a) => a.name).join(' ')].join(' '),
    ),
    words,
  );

export const contactMatches = (c: Contact, words: string[]) =>
  all(memo(c, (x) => [x.firstName, x.lastName, x.email, x.phone, x.jobTitle, x.company, x.notes].join(' ')), words);

export const eventMatches = (ev: CalendarEvent, words: string[]) =>
  all(memo(ev, (x) => [x.title, x.description, x.location].join(' ')), words);

export const taskMatches = (t: Task, words: string[]) => all(memo(t, (x) => `${x.title} ${x.notes}`), words);

export function filterBy<T>(items: T[], query: string, matches: (item: T, words: string[]) => boolean): T[] {
  const words = tokens(query);
  return words.length ? items.filter((i) => matches(i, words)) : items;
}

// ---- Search operators (from:, to:, subject:, has:attachment, is:unread, before:, after:, in:) ----

export interface ParsedSearch {
  words: string[];
  not: string[];
  from: string[];
  to: string[];
  subject: string[];
  hasAttachment: boolean;
  is: string[];
  importance?: string;
  before?: number;
  after?: number;
  /** A folder id or "all". Anything given widens the search beyond the folder being viewed. */
  folder?: string;
  label?: string;
  /** True when anything beyond plain words was used. */
  advanced: boolean;
}

const dayStart = (v: string): number | undefined => {
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return undefined;
  return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
};

export function parseSearch(query: string): ParsedSearch {
  const out: ParsedSearch = { words: [], not: [], from: [], to: [], subject: [], hasAttachment: false, is: [], advanced: false };
  const re = /(-?)(?:(\w+):)?(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    const neg = m[1] === '-';
    const key = m[2]?.toLowerCase();
    const val = fold(m[3] ?? m[4] ?? '').trim();
    if (!val) continue;
    if (!key) {
      (neg ? out.not : out.words).push(val);
      if (neg) out.advanced = true;
      continue;
    }
    switch (key) {
      case 'from': out.from.push(val); break;
      case 'to': out.to.push(val); break;
      case 'subject': out.subject.push(val); break;
      case 'has': if (val.startsWith('attach')) out.hasAttachment = true; else out.words.push(`${key}:${val}`); break;
      case 'is': out.is.push(val); break;
      case 'importance': out.importance = val; break;
      case 'before': { const t = dayStart(val); if (t !== undefined) out.before = t; break; }
      case 'after': { const t = dayStart(val); if (t !== undefined) out.after = t; break; }
      case 'in': out.folder = val; break;
      case 'label': case 'category': out.label = val; break;
      default: out.words.push(`${key}:${val}`); continue; // not an operator: treat as text
    }
    out.advanced = true;
  }
  return out;
}

export function emailMatchesSearch(e: Email, p: ParsedSearch): boolean {
  if (p.words.length && !emailMatches(e, p.words)) return false;
  if (p.not.length && p.not.some((w) => emailMatches(e, [w]))) return false;
  if (p.from.length && !all(fold(`${e.sender} ${e.senderEmail}`), p.from)) return false;
  if (p.to.length && !all(fold([...(e.toAddresses ?? []), ...(e.ccAddresses ?? [])].join(' ')), p.to)) return false;
  if (p.subject.length && !all(fold(e.subject), p.subject)) return false;
  if (p.hasAttachment && e.attachments.length === 0) return false;
  for (const flag of p.is) {
    if (flag === 'unread' && e.read) return false;
    if (flag === 'read' && !e.read) return false;
    if ((flag === 'flagged' || flag === 'starred') && !e.starred) return false;
    if (flag === 'pinned' && !e.pinned) return false;
    if (flag === 'important' && e.importance !== 'high') return false;
  }
  if (p.importance && (e.importance ?? 'normal') !== p.importance) return false;
  const when = e.createdAt ? new Date(e.createdAt).getTime() : NaN;
  if (p.before !== undefined && !(when < p.before)) return false;
  if (p.after !== undefined && !(when >= p.after)) return false;
  if (p.label && !e.labels.some((l) => fold(l) === p.label)) return false;
  return true;
}

export function searchEmails(list: Email[], query: string): Email[] {
  const p = parseSearch(query);
  if (!p.words.length && !p.advanced) return list;
  return list.filter((e) => emailMatchesSearch(e, p));
}
