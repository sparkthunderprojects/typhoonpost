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
