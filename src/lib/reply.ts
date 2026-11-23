import type { Email } from '@/types';

export type ReplyMode = 'reply' | 'replyAll' | 'forward';

export interface ReplyDraft {
  to: string[];
  cc: string[];
  subject: string;
  /** HTML: an empty line to type in, then the quoted original. */
  body: string;
  /** Forwarding carries the original's files along. */
  keepAttachments: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Adds "Re:" or "Fwd:" once, however many times the thread has gone back and forth. */
export function prefixSubject(subject: string, mode: ReplyMode): string {
  const s = subject.trim();
  if (mode === 'forward') return /^(fwd?|fw):\s*/i.test(s) ? s.replace(/^fw:/i, 'Fwd:') : `Fwd: ${s}`;
  return /^re:\s*/i.test(s) ? s : `Re: ${s}`;
}

const norm = (a: string) => a.trim().toLowerCase();

function unique(list: string[], skip: Set<string>): string[] {
  const out: string[] = [];
  for (const a of list.map(norm).filter(Boolean)) {
    if (skip.has(a) || out.includes(a)) continue;
    out.push(a);
  }
  return out;
}

function whenOf(email: Email): string {
  if (email.createdAt) {
    const d = new Date(email.createdAt);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return [email.date, email.timestamp].filter(Boolean).join(' ');
}

function who(name: string, address: string): string {
  return name && address && name.toLowerCase() !== address.toLowerCase()
    ? `${escapeHtml(name)} &lt;${escapeHtml(address)}&gt;`
    : escapeHtml(address || name);
}

/**
 * Works out who a reply goes to and what the quoted message looks like.
 * `clean` should strip anything unsafe or remote from the original's HTML (the app passes the same
 * privacy filter used for reading, so quoting never loads a tracking image).
 */
export function buildReply(
  email: Email,
  mode: ReplyMode,
  myAddress: string,
  clean: (html: string) => string = (h) => h,
): ReplyDraft {
  const me = norm(myAddress);
  const skip = new Set([me]);
  const sentByMe = norm(email.senderEmail) === me || email.folder === 'sent';
  const originalTo = email.toAddresses ?? [];
  const originalCc = email.ccAddresses ?? [];

  let to: string[] = [];
  let cc: string[] = [];
  if (mode === 'reply') {
    // Replying to something you sent goes back to the people you sent it to.
    to = sentByMe ? unique(originalTo, skip) : unique([email.senderEmail], skip);
  } else if (mode === 'replyAll') {
    to = sentByMe ? unique(originalTo, skip) : unique([email.senderEmail], skip);
    cc = unique([...(sentByMe ? originalCc : [...originalTo, ...originalCc])], new Set([...skip, ...to]));
  }

  if (mode !== 'forward' && to.length === 0) to = [norm(email.senderEmail)].filter(Boolean);

  const quoted = clean(email.body);
  const header =
    mode === 'forward'
      ? `<p>---------- Forwarded message ----------<br><b>From:</b> ${who(email.sender, email.senderEmail)}<br><b>Date:</b> ${escapeHtml(whenOf(email))}<br><b>Subject:</b> ${escapeHtml(email.subject)}<br><b>To:</b> ${escapeHtml(originalTo.join(', '))}${originalCc.length ? `<br><b>Cc:</b> ${escapeHtml(originalCc.join(', '))}` : ''}</p>`
      : `<p>On ${escapeHtml(whenOf(email))}, ${who(email.sender, email.senderEmail)} wrote:</p>`;

  const body =
    mode === 'forward'
      ? `<p></p><p></p>${header}${quoted}`
      : `<p></p><p></p>${header}<blockquote>${quoted}</blockquote>`;

  return { to, cc, subject: prefixSubject(email.subject, mode), body, keepAttachments: mode === 'forward' };
}
