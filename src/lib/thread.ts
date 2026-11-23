import type { Email } from '@/types';

/** "Re: RE: Fwd: Budget " → "budget". Threading happens in the browser, from decrypted subjects only. */
export function normalizeSubject(subject: string): string {
  let s = subject.trim();
  for (;;) {
    const next = s.replace(/^\s*(re|fwd?|fw|aw|sv|vs)\s*(\[\d+\])?\s*:\s*/i, '');
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Messages with no real subject never join a conversation. */
export function threadKey(email: Pick<Email, 'subject'>): string {
  const k = normalizeSubject(email.subject);
  return k === '' || k === '(no subject)' ? '' : k;
}

export interface ThreadGroup {
  key: string;
  /** The first message in list order, which stands for the conversation. */
  head: Email;
  /** Every message in the conversation in list order, head first. */
  items: Email[];
  unread: number;
}

/** Groups a list into conversations, keeping the order in which each conversation first appears. */
export function groupThreads(emails: Email[]): ThreadGroup[] {
  const out: ThreadGroup[] = [];
  const byKey = new Map<string, ThreadGroup>();
  for (const e of emails) {
    const key = threadKey(e);
    const found = key ? byKey.get(key) : undefined;
    if (found) {
      found.items.push(e);
      if (!e.read) found.unread++;
      continue;
    }
    const g: ThreadGroup = { key, head: e, items: [e], unread: e.read ? 0 : 1 };
    out.push(g);
    if (key) byKey.set(key, g);
  }
  return out;
}

/** Everything in the mailbox that belongs to this conversation, oldest first. Bin and junk are left out. */
export function conversationOf(email: Email, all: Email[]): Email[] {
  const key = threadKey(email);
  if (!key) return [email];
  return all
    .filter((e) => threadKey(e) === key && e.folder !== 'trash' && e.folder !== 'spam' && e.folder !== 'drafts')
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
}

export type FocusChoice = 'focused' | 'other';

/** A sender you moved by hand beats the automatic sorting. */
export function isFocused(email: Pick<Email, 'senderEmail' | 'category'>, overrides: Record<string, FocusChoice>): boolean {
  const o = overrides[email.senderEmail.toLowerCase()];
  return o ? o === 'focused' : email.category === 'primary';
}
