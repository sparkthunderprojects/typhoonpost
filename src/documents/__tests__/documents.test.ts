import { describe, expect, it } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { decryptRecord, encryptRecord } from '../../lib/crypto/record';
import { buildMeta, countWords, safeFileName, toMarkdown, toText } from '../format';
import { buildDocx } from '../exportDocx';
import { findMatches } from '../extensions';
import type { PMNode } from '../types';

const sk = x25519.utils.randomSecretKey();
const pk = x25519.getPublicKey(sk);

const p = (text: string, marks?: PMNode['marks']): PMNode => ({ type: 'paragraph', content: [{ type: 'text', text, marks }] });
const sample: PMNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Quarterly report' }] },
    p('Hello '),
    { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }, { type: 'text', text: ' and a ' }, { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.org' } }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('one')] }, { type: 'listItem', content: [p('two'), { type: 'orderedList', content: [{ type: 'listItem', content: [p('nested')] }] }] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('done')] }] },
    { type: 'table', content: [
      { type: 'tableRow', content: [{ type: 'tableHeader', content: [p('A')] }, { type: 'tableHeader', content: [p('B')] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [p('1')] }, { type: 'tableCell', content: [{ type: 'paragraph' }] }] },
    ] },
    { type: 'blockquote', content: [p('quoted')] },
    { type: 'codeBlock', content: [{ type: 'text', text: 'let x = 1' }] },
    { type: 'horizontalRule' },
  ],
};

describe('doc record encryption', () => {
  const body = { v: 1, doc: sample, page: { size: 'a4' } };
  it('round-trips and never stores readable text', () => {
    const enc = encryptRecord('doc', body, pk);
    expect(enc.payload).not.toContain('Quarterly');
    expect(atob(enc.payload).includes('Quarterly')).toBe(false);
    expect(decryptRecord('doc', enc, sk)).toEqual(body);
  });
  it('fails closed on wrong kind, wrong key and tampering', () => {
    const enc = encryptRecord('doc', body, pk);
    expect(() => decryptRecord('docmeta', enc, sk)).toThrow();
    expect(() => decryptRecord('task', enc, sk)).toThrow();
    expect(() => decryptRecord('doc', enc, x25519.utils.randomSecretKey())).toThrow();
    const raw = atob(enc.payload);
    const flipped = raw.slice(0, 40) + String.fromCharCode(raw.charCodeAt(40) ^ 1) + raw.slice(41);
    expect(() => decryptRecord('doc', { ...enc, payload: btoa(flipped) }, sk)).toThrow();
  });
  it('meta and body are separate records that cannot stand in for each other', () => {
    const meta = encryptRecord('docmeta', buildMeta('T', sample), pk);
    expect(() => decryptRecord('doc', meta, sk)).toThrow();
  });
});

describe('text helpers', () => {
  it('extracts text, counts words and builds meta', () => {
    const t = toText(sample);
    expect(t).toContain('Quarterly report');
    expect(t).toContain('nested');
    expect(countWords("Don't stop — it's 2026!")).toBe(4);
    const m = buildMeta('', sample);
    expect(m.title).toBe('Quarterly report');
    expect(m.words).toBeGreaterThan(8);
    expect(buildMeta('Mine', sample).title).toBe('Mine');
    expect(buildMeta('', { type: 'doc', content: [{ type: 'paragraph' }] }).title).toBe('Untitled document');
  });
  it('writes Markdown', () => {
    const md = toMarkdown(sample);
    expect(md).toContain('# Quarterly report');
    expect(md).toContain('**bold**');
    expect(md).toContain('[link](https://example.org)');
    expect(md).toContain('- one');
    expect(md).toContain('  1. nested');
    expect(md).toContain('- [x] done');
    expect(md).toContain('| A | B |');
    expect(md).toContain('> quoted');
  });
  it('keeps bold markers tight against the text', () => {
    expect(toMarkdown({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'text', text: ' strong ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'b' }] }] })).toBe('a **strong** b\n');
  });
  it('makes safe file names', () => {
    expect(safeFileName('a/b:c*?')).toBe('a b c');
    expect(safeFileName('   ')).toBe('Untitled document');
  });
});

describe('find', () => {
  it('finds with case and whole-word options', () => {
    const fake = { descendants: (f: (n: unknown, pos: number) => void) => f({ isText: true, text: 'Cat catalog cat' }, 0) } as never;
    expect(findMatches(fake, 'cat', false, false).length).toBe(3);
    expect(findMatches(fake, 'cat', true, false).length).toBe(2);
    expect(findMatches(fake, 'cat', false, true).length).toBe(2);
    expect(findMatches(fake, '', false, false).length).toBe(0);
  });
});

describe('docx export', () => {
  it('produces a valid zip with the document text', async () => {
    const blob = await buildDocx('Report', sample, 'a4', () => ({ w: 100, h: 100 }));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Quarterly report');
    expect(xml).toContain('nested');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('w:hyperlink');
  });
  it('handles an empty document and a hostile link', async () => {
    const empty = await buildDocx('x', { type: 'doc', content: [] }, 'letter', () => ({ w: 1, h: 1 }));
    expect(empty.size).toBeGreaterThan(500);
    const bad: PMNode = { type: 'doc', content: [p('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])] };
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(new Uint8Array(await (await buildDocx('x', bad, 'a4', () => ({ w: 1, h: 1 }))).arrayBuffer()));
    expect(await zip.file('word/document.xml')!.async('string')).not.toContain('javascript:');
  });
});
