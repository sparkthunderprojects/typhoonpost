import type { Email } from '@/types';
import type { PMNode } from '@/documents/types';

/** Readable text from a message's HTML, keeping paragraph and line breaks. */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return text.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
}

const para = (text: string): PMNode => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' });

/** A Doc made from a message: its subject as the title, who sent it and when, then the text. */
export function messageToDoc(e: Pick<Email, 'subject' | 'sender' | 'senderEmail' | 'body' | 'createdAt' | 'date'>): { title: string; doc: PMNode } {
  const title = e.subject.trim() || '(No subject)';
  const when = e.createdAt ? new Date(e.createdAt).toLocaleString() : e.date;
  const lines = htmlToLines(e.body);
  // Collapse runs of blank lines to one.
  const body: PMNode[] = [];
  for (const l of lines) {
    if (!l && (body.length === 0 || !body[body.length - 1].content)) continue;
    body.push(para(l));
  }
  while (body.length && !body[body.length - 1].content) body.pop();
  return {
    title,
    doc: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
        para(`From ${e.sender} <${e.senderEmail}> · ${when}`),
        ...body,
      ],
    },
  };
}
