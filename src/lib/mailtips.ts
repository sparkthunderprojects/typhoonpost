export interface TipInput {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  /** The message as written, HTML or text. Quoted earlier messages are ignored. */
  body: string;
  attachmentCount: number;
  isReplyAll: boolean;
  /** Addresses that are on Typhoonpost, so mail to them stays inside it. */
  inside: (address: string) => boolean;
}

export interface Tip { id: 'large-group' | 'missing-attachment' | 'outside' | 'no-subject'; text: string }

export const LARGE_GROUP = 10;

const ATTACH_WORDS = /\b(attached|attaching|attachment|attachments|enclosed|i('| ha)ve attached|see attached|find attached)\b/i;

/** Only what the writer typed: drops quoted replies and the signature line. */
export function ownText(body: string): string {
  const cut = body.split(/<blockquote|<div class="quoted|-----Original Message-----|\nOn .{5,80} wrote:/i)[0];
  return cut.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Things worth a second look before a message goes out. All worked out on this device. */
export function mailTips(i: TipInput): Tip[] {
  const tips: Tip[] = [];
  const everyone = [...i.to, ...i.cc, ...i.bcc];
  if (i.isReplyAll && i.to.length + i.cc.length >= LARGE_GROUP) {
    tips.push({ id: 'large-group', text: `This reply goes to ${i.to.length + i.cc.length} people.` });
  } else if (i.to.length + i.cc.length >= LARGE_GROUP * 2) {
    tips.push({ id: 'large-group', text: `This message goes to ${i.to.length + i.cc.length} people.` });
  }
  if (i.attachmentCount === 0 && ATTACH_WORDS.test(ownText(i.body))) {
    tips.push({ id: 'missing-attachment', text: 'You mention an attachment, but nothing is attached.' });
  }
  const outside = everyone.filter((a) => !i.inside(a));
  if (outside.length > 0) {
    tips.push({
      id: 'outside',
      text: outside.length === 1
        ? `${outside[0]} is not on Typhoonpost. This message goes through an outside mail provider, which can read it.`
        : `${outside.length} recipients are not on Typhoonpost. Their copies go through an outside mail provider, which can read them.`,
    });
  }
  if (!i.subject.trim()) tips.push({ id: 'no-subject', text: 'There is no subject.' });
  return tips;
}

export interface Signature { id: string; name: string; text: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A signature typed as plain lines, as the HTML added under a message. */
export function signatureHtml(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return `<p style="color: rgb(var(--fg-subtle)); margin-top: 1.5rem;">${t.split(/\r?\n/).map(esc).join('<br>')}</p>`;
}

/** Which signature goes on a message: the one chosen for replies or for new mail. */
export function pickSignature(sigs: Signature[], newId: string | null, replyId: string | null, isReply: boolean): Signature | null {
  const id = isReply ? replyId : newId;
  return sigs.find((s) => s.id === id) ?? null;
}
