import { describe, expect, it } from 'vitest';
import { mailTips, ownText, pickSignature, signatureHtml } from '@/lib/mailtips';

const base = { to: ['a@typhoonpost.com'], cc: [], bcc: [], subject: 'Hi', body: '<p>Hello</p>', attachmentCount: 0, isReplyAll: false, inside: (a: string) => a.endsWith('@typhoonpost.com') };
const ids = (i: Parameters<typeof mailTips>[0]) => mailTips(i).map((t) => t.id);

describe('mail tips', () => {
  it('says nothing for an ordinary message', () => expect(ids(base)).toEqual([]));
  it('catches a missing attachment but not quoted text', () => {
    expect(ids({ ...base, body: '<p>See attached report</p>' })).toEqual(['missing-attachment']);
    expect(ids({ ...base, body: '<p>See attached report</p>', attachmentCount: 1 })).toEqual([]);
    expect(ids({ ...base, body: '<p>Thanks</p><blockquote>please see attached</blockquote>' })).toEqual([]);
  });
  it('warns about a large reply all', () => {
    const many = Array.from({ length: 12 }, (_, i) => `p${i}@typhoonpost.com`);
    expect(ids({ ...base, to: many, isReplyAll: true })).toEqual(['large-group']);
    expect(ids({ ...base, to: many })).toEqual([]);
  });
  it('warns about people outside Typhoonpost, Bcc included', () => {
    expect(ids({ ...base, bcc: ['x@gmail.com'] })).toEqual(['outside']);
  });
  it('flags a missing subject', () => expect(ids({ ...base, subject: '  ' })).toEqual(['no-subject']));
  it('ownText drops a quoted reply', () => expect(ownText('<p>Hi</p><blockquote>old</blockquote>')).toBe('Hi'));
});

describe('signatures', () => {
  const sigs = [{ id: 'a', name: 'Work', text: 'x' }, { id: 'b', name: 'Short', text: 'y' }];
  it('picks by new versus reply', () => {
    expect(pickSignature(sigs, 'a', 'b', false)?.id).toBe('a');
    expect(pickSignature(sigs, 'a', 'b', true)?.id).toBe('b');
    expect(pickSignature(sigs, null, null, true)).toBeNull();
  });
  it('escapes markup and keeps lines', () => {
    expect(signatureHtml('Ann <b>\nCo')).toContain('Ann &lt;b&gt;<br>Co');
    expect(signatureHtml('  ')).toBe('');
  });
});
