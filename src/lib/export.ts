import type { Email } from '@/types';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const wrap76 = (s: string) => s.replace(/(.{76})/g, '$1\r\n');
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** Header text: plain when it is ASCII, otherwise RFC 2047 encoded so every mail program can read it. */
function headerText(s: string): string {
  const flat = s.replace(/[\r\n]+/g, ' ');
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(flat) ? flat : `=?UTF-8?B?${b64(flat)}?=`;
}

function addr(name: string, address: string): string {
  const n = name.replace(/["\r\n]/g, '').trim();
  return n && n.toLowerCase() !== address.toLowerCase() ? `${headerText(`"${n}"`)} <${address}>` : address;
}

/** The message as a standard .eml file. Files are not included; only the text of the message. */
export function toEml(email: Email, cleanHtml: (html: string) => string = (h) => h): string {
  const date = email.createdAt ? new Date(email.createdAt) : new Date();
  const lines = [
    `From: ${addr(email.sender, email.senderEmail)}`,
    email.toAddresses?.length ? `To: ${email.toAddresses.join(', ')}` : '',
    email.ccAddresses?.length ? `Cc: ${email.ccAddresses.join(', ')}` : '',
    `Subject: ${headerText(email.subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${email.id}@typhoonpost.local>`,
    email.importance === 'high' ? 'Importance: high' : email.importance === 'low' ? 'Importance: low' : '',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  return `${lines.join('\r\n')}\r\n\r\n${wrap76(b64(cleanHtml(email.body)))}\r\n`;
}

export function fileNameFor(email: Pick<Email, 'subject'>, ext: string): string {
  const base = email.subject.replace(/[^\p{L}\p{N}\-_. ]+/gu, '').trim().replace(/\s+/g, ' ').slice(0, 60) || 'message';
  return `${base}.${ext}`;
}

export function downloadText(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A self-contained page for printing: who, when, subject, then the message. No scripts, no remote images. */
export function printHtml(email: Email, cleanHtml: (html: string) => string): string {
  const when = email.createdAt ? new Date(email.createdAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }) : '';
  const row = (k: string, v: string) => (v ? `<tr><th>${k}</th><td>${escapeHtml(v)}</td></tr>` : '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(email.subject)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0 0 12px}
table{border-collapse:collapse;margin-bottom:16px;border-bottom:1px solid #ccc;width:100%}th{text-align:left;color:#555;padding:2px 12px 2px 0;white-space:nowrap;vertical-align:top;font-weight:600}
td{padding:2px 0}img{max-width:100%}blockquote{margin:8px 0 8px 4px;padding-left:12px;border-left:3px solid #ccc;color:#444}</style></head><body>
<h1>${escapeHtml(email.subject)}</h1><table>
${row('From', `${email.sender} <${email.senderEmail}>`)}${row('Date', when)}${row('To', (email.toAddresses ?? []).join(', '))}${row('Cc', (email.ccAddresses ?? []).join(', '))}
</table>${cleanHtml(email.body)}</body></html>`;
}

export function printEmail(email: Email, cleanHtml: (html: string) => string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.srcdoc = printHtml(email, cleanHtml);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  };
  document.body.appendChild(frame);
}
