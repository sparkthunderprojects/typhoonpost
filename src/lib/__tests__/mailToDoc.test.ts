import { describe, expect, it } from 'vitest';
import { messageToDoc } from '@/lib/mailToDoc';
import { planAutoEmpty, ordered } from '@/lib/quicksteps';

describe('messageToDoc', () => {
  it('uses the subject as the title and keeps line breaks', () => {
    const { title, doc } = messageToDoc({ subject: 'Plans', sender: 'Ann', senderEmail: 'a@x.com', body: '<p>Hello&nbsp;there</p><p></p><p></p><p>Bye<br>now</p>', date: 'Mon' });
    expect(title).toBe('Plans');
    const texts = doc.content!.map((n) => n.content?.[0]?.text ?? '');
    expect(texts[0]).toBe('Plans');
    expect(texts[1]).toContain('a@x.com');
    expect(texts.slice(2)).toEqual(['Hello there', '', 'Bye', 'now']);
  });
  it('falls back for an empty subject', () => {
    expect(messageToDoc({ subject: ' ', sender: 'A', senderEmail: 'a@x.com', body: '', date: '' }).title).toBe('(No subject)');
  });
});

describe('auto empty', () => {
  const day = 86_400_000;
  const now = Date.parse('2026-05-01T00:00:00Z');
  it('stamps unseen messages now and never removes them straight away', () => {
    const r = planAutoEmpty(['a'], {}, 30, now);
    expect(r.remove).toEqual([]);
    expect(r.next.a).toBe(new Date(now).toISOString());
  });
  it('removes only those older than the limit and forgets ids that left', () => {
    const stamps = { old: new Date(now - 31 * day).toISOString(), fresh: new Date(now - 2 * day).toISOString(), gone: new Date(now - 90 * day).toISOString() };
    const r = planAutoEmpty(['old', 'fresh'], stamps, 30, now);
    expect(r.remove).toEqual(['old']);
    expect(Object.keys(r.next)).toEqual(['fresh']);
  });
  it('never removes anything when the setting is off', () => {
    const r = planAutoEmpty(['old'], { old: new Date(now - 400 * day).toISOString() }, 0, now);
    expect(r.remove).toEqual([]);
  });
});

describe('quick step ordering', () => {
  it('runs in-place changes first and keeps only the last move', () => {
    const r = ordered([{ type: 'archive' }, { type: 'markRead' }, { type: 'delete' }]);
    expect(r.map((a) => a.type)).toEqual(['markRead', 'delete']);
  });
});
