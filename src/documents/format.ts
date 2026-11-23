import type { DocMeta, PMNode } from './types';

/** Pure helpers over ProseMirror JSON: text, counts and Markdown. No browser APIs, so they are unit tested. */

const BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'taskItem', 'tableRow', 'horizontalRule']);

export function toText(node: PMNode): string {
  const out: string[] = [];
  const walk = (n: PMNode) => {
    if (n.type === 'text') out.push(n.text ?? '');
    else if (n.type === 'hardBreak') out.push('\n');
    else if (n.type === 'tableCell' || n.type === 'tableHeader') {
      (n.content ?? []).forEach(walk);
      out.push('\t');
      return;
    }
    (n.content ?? []).forEach(walk);
    if (BLOCKS.has(n.type)) out.push('\n');
  };
  walk(node);
  return out.join('').replace(/\t\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export function firstHeading(node: PMNode): string {
  for (const n of node.content ?? []) {
    if ((n.type === 'heading' || (n.attrs?.docStyle === 'title')) && toText(n)) return toText(n).split('\n')[0].slice(0, 120);
  }
  return '';
}

export function buildMeta(title: string, doc: PMNode): DocMeta {
  const text = toText(doc);
  return {
    title: title.trim() || firstHeading(doc) || 'Untitled document',
    excerpt: text.replace(/\s+/g, ' ').slice(0, 200),
    words: countWords(text),
  };
}

function inline(n: PMNode): string {
  if (n.type === 'hardBreak') return '  \n';
  if (n.type === 'image') return `![${String(n.attrs?.alt ?? '')}](${String(n.attrs?.src ?? '').startsWith('data:') ? 'image' : String(n.attrs?.src ?? '')})`;
  let t = n.text ?? (n.content ?? []).map(inline).join('');
  const marks = n.marks ?? [];
  // Markdown markers must hug the text, so spaces at the edges stay outside them.
  const lead = /^\s*/.exec(t)![0];
  const trail = t.trim() ? /\s*$/.exec(t)![0] : '';
  t = t.trim() ? t.trim() : t;
  const has = (name: string) => marks.some((m) => m.type === name);
  if (has('code')) t = '`' + t + '`';
  if (has('bold')) t = `**${t}**`;
  if (has('italic')) t = `*${t}*`;
  if (has('strike')) t = `~~${t}~~`;
  const link = marks.find((m) => m.type === 'link');
  if (link) t = `[${t}](${String(link.attrs?.href ?? '')})`;
  return lead + t + trail;
}

function block(n: PMNode, indent = ''): string {
  const kids = n.content ?? [];
  switch (n.type) {
    case 'paragraph':
      return indent + kids.map(inline).join('');
    case 'heading':
      return `${'#'.repeat(Number(n.attrs?.level ?? 1))} ${kids.map(inline).join('')}`;
    case 'blockquote':
      return kids.map((k) => block(k)).join('\n\n').split('\n').map((l) => `> ${l}`).join('\n');
    case 'codeBlock':
      return '```\n' + kids.map((k) => k.text ?? '').join('') + '\n```';
    case 'horizontalRule':
      return '---';
    case 'image':
      return inline(n);
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return kids
        .map((li, i) => {
          const bullet = n.type === 'orderedList' ? `${i + 1}.` : n.type === 'taskList' ? `- [${li.attrs?.checked ? 'x' : ' '}]` : '-';
          const parts = (li.content ?? []).map((c) => (['bulletList', 'orderedList', 'taskList'].includes(c.type) ? block(c, indent + '  ') : block(c)));
          const [first, ...rest] = parts;
          return `${indent}${bullet} ${first ?? ''}${rest.length ? '\n' + rest.join('\n') : ''}`;
        })
        .join('\n');
    case 'table': {
      const rows = kids.map((r) => (r.content ?? []).map((c) => toText(c).replace(/\n+/g, ' ').replace(/\|/g, '\\|')));
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
      return [pad(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(pad)].join('\n');
    }
    default:
      return kids.map((k) => block(k)).join('\n\n');
  }
}

export function toMarkdown(doc: PMNode): string {
  return (doc.content ?? []).map((n) => block(n)).join('\n\n').trim() + '\n';
}

export function safeFileName(title: string): string {
  return (title.trim() || 'Untitled document').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 100).trim();
}
