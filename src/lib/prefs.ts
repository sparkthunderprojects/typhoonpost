import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { decryptRecord, encryptRecord } from '@/lib/crypto/record';
import { getPrivateKey } from '@/lib/crypto/keyStore';
import { ownPublicKey } from '@/lib/db';
import { FOLDER_NAMES, LABEL_DEFS, type FolderId, type LabelDef } from '@/types';

/**
 * Everything a person sets up for their own mailbox: folders, categories, favourites and, in later
 * releases, rules, templates and saved searches. It is stored as one encrypted record, so the
 * server never sees a folder name or a rule.
 */
export interface MailFolder { id: string; name: string; color: string; parent: string | null; order: number }
export interface MailCategory { id: string; name: string; color: string }

export interface Prefs {
  v: 1;
  folders: MailFolder[];
  categories: MailCategory[];
  favourites: string[];
  readingPane: ReadingPane;
  density: Density;
  /** Group messages with the same subject into one conversation in the list. */
  conversations: boolean;
  /** Conversation keys (normalised subjects) whose messages go straight to Deleted Items. */
  ignored: string[];
  /** Senders you moved to Focused or Other by hand. */
  senderFocus: Record<string, 'focused' | 'other'>;
  /** Blocked senders go to Junk. Entries: an address or a domain. */
  blocked: string[];
  /** Safe senders are never blocked. */
  safe: string[];
  rules: MailRule[];
  /** Mail that arrived after this moment has had the rules applied. */
  rulesCheckedAt?: string;
  autoReply: AutoReply;
  /** Who got an automatic reply, and when, so nobody gets one twice in a few days. */
  autoReplied: Record<string, string>;
  /** Seconds a sent message is held back so you can still take it back. */
  undoSendSeconds: number;
  /** Draft id → time it should be sent. Sent by this browser while Typhoonpost is open. */
  scheduled: Record<string, string>;
  calendars: CalendarDef[];
  weekStartsOn: 0 | 1;
  /** A second time zone shown beside the hours in Day and Week views. */
  secondaryTz: string;
  showTasksOnCalendar: boolean;
  /** Internet calendars you subscribe to. Read-only; the events are fetched fresh and never stored. */
  subscriptions: Subscription[];
  workStart: number;
  workEnd: number;
  workDays: number[];
  showWeekNumbers: boolean;
  savedSearches: SavedSearch[];
  templates: MailTemplate[];
  quickSteps: QuickStep[];
  /** Deleted Items older than this many days are removed for good, by this browser. 0 means never. */
  autoEmptyDays: number;
  /** Message id → when this browser first saw it in Deleted Items. Auto-empty counts days from here. */
  trashedAt: Record<string, string>;
}

export interface SavedSearch { id: string; name: string; query: string }
export interface MailTemplate { id: string; name: string; subject: string; body: string }

export interface Subscription { id: string; name: string; url: string; color: string; visible: boolean }

export interface CalendarDef { id: string; name: string; color: string; visible: boolean }
export const DEFAULT_CALENDAR_ID = 'default';

import { DEFAULT_AUTOREPLY, type AutoReply, type MailRule } from '@/lib/rules';
import { DEFAULT_QUICK_STEPS, type QuickStep } from '@/lib/quicksteps';

export type ReadingPane = 'right' | 'bottom' | 'off';
export type Density = 'comfortable' | 'compact';

export const DEFAULT_PREFS: Prefs = {
  v: 1,
  folders: [],
  categories: [],
  favourites: ['inbox', 'sent', 'drafts'],
  readingPane: 'right',
  density: 'comfortable',
  conversations: true,
  ignored: [],
  senderFocus: {},
  blocked: [],
  safe: [],
  rules: [],
  autoReply: DEFAULT_AUTOREPLY,
  autoReplied: {},
  undoSendSeconds: 10,
  scheduled: {},
  calendars: [{ id: 'default', name: 'Calendar', color: '#2563eb', visible: true }],
  weekStartsOn: 1,
  secondaryTz: '',
  showTasksOnCalendar: true,
  subscriptions: [],
  workStart: 9,
  workEnd: 17,
  workDays: [1, 2, 3, 4, 5],
  showWeekNumbers: false,
  savedSearches: [],
  templates: [],
  quickSteps: DEFAULT_QUICK_STEPS,
  autoEmptyDays: 0,
  trashedAt: {},
};

let state: Prefs = DEFAULT_PREFS;
let revision = 0; // 0 = nothing stored yet
let loaded = false;
let timer: number | undefined;
let saving = false;
let dirty = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getPrefs = () => state;
export const usePrefs = (): Prefs => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);

export const newId = () => crypto.randomUUID().slice(0, 12);

/** Load once after sign-in. Missing fields are filled from the defaults so older records keep opening. */
export async function loadPrefs(): Promise<void> {
  const key = getPrivateKey();
  const { data, error } = await supabase.from('mail_prefs').select('*').maybeSingle();
  if (error) throw error;
  if (data && key) {
    try {
      const stored = decryptRecord<Partial<Prefs>>('prefs', { version: data.enc_version, payload: data.enc_payload, key: data.enc_key }, key);
      state = { ...DEFAULT_PREFS, ...stored, v: 1 };
      revision = data.revision;
    } catch {
      state = DEFAULT_PREFS; // unreadable: leave the stored copy alone and do not overwrite it
      revision = -1;
    }
  } else {
    state = DEFAULT_PREFS;
    revision = 0;
  }
  loaded = true;
  emit();
}

export function resetPrefs() {
  state = DEFAULT_PREFS; revision = 0; loaded = false; dirty = false;
  window.clearTimeout(timer);
  emit();
}

export function updatePrefs(fn: (p: Prefs) => Prefs): void {
  state = fn(state);
  emit();
  if (!loaded || revision === -1) return;
  dirty = true;
  window.clearTimeout(timer);
  timer = window.setTimeout(save, 700);
}

async function save(): Promise<void> {
  if (saving || !dirty) return;
  saving = true;
  dirty = false;
  try {
    const enc = encryptRecord('prefs', state, ownPublicKey());
    const cols = { enc_version: enc.version, enc_payload: enc.payload, enc_key: enc.key };
    if (revision === 0) {
      const { data, error } = await supabase.from('mail_prefs').insert(cols).select('revision').single();
      if (error) throw error;
      revision = data.revision;
    } else {
      const { data, error } = await supabase.from('mail_prefs')
        .update({ ...cols, revision: revision + 1, updated_at: new Date().toISOString() })
        .eq('revision', revision).select('revision').maybeSingle();
      if (error) throw error;
      if (!data) { // saved elsewhere meanwhile: take the latest revision and write ours over it
        const cur = await supabase.from('mail_prefs').select('revision').single();
        if (cur.error) throw cur.error;
        revision = cur.data.revision;
        dirty = true;
      } else revision = data.revision;
    }
  } catch {
    dirty = true;
    timer = window.setTimeout(save, 8000);
  } finally {
    saving = false;
    if (dirty && !timer) timer = window.setTimeout(save, 700);
  }
}

// ---------------------------------------------------------------------------
// Names and colours, for built-in and custom folders and categories alike
// ---------------------------------------------------------------------------

export function folderName(id: FolderId | string, p: Prefs = state): string {
  if (id in FOLDER_NAMES) return FOLDER_NAMES[id as keyof typeof FOLDER_NAMES];
  return p.folders.find((f) => `f:${f.id}` === id)?.name ?? 'Folder';
}

export function categoryDefs(p: Prefs = state): LabelDef[] {
  return [...LABEL_DEFS, ...p.categories.map((c) => ({ id: `c:${c.id}`, name: c.name, color: c.color }))];
}

export function categoryDef(id: string, p: Prefs = state): LabelDef | undefined {
  return categoryDefs(p).find((d) => d.id === id);
}

/** Folders in display order: top level by order, each followed by its children. */
export function folderTree(p: Prefs): { folder: MailFolder; depth: number }[] {
  const out: { folder: MailFolder; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    p.folders.filter((f) => f.parent === parent).sort((a, b) => a.order - b.order).forEach((f) => { out.push({ folder: f, depth }); if (depth < 4) walk(f.id, depth + 1); });
  };
  walk(null, 0);
  return out;
}

export function descendantIds(p: Prefs, id: string): string[] {
  const kids = p.folders.filter((f) => f.parent === id).map((f) => f.id);
  return kids.flatMap((k) => [k, ...descendantIds(p, k)]);
}

export function addFolder(name: string, parent: string | null = null, color = '#64748b'): string {
  const id = newId();
  updatePrefs((p) => ({ ...p, folders: [...p.folders, { id, name: name.trim() || 'New folder', color, parent, order: Math.max(-1, ...p.folders.filter((f) => f.parent === parent).map((f) => f.order)) + 1 }] }));
  return `f:${id}`;
}
export const renameFolder = (id: string, name: string, color?: string) =>
  updatePrefs((p) => ({ ...p, folders: p.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name, color: color ?? f.color } : f)) }));
export const removeFolder = (id: string) =>
  updatePrefs((p) => {
    const gone = new Set([id, ...descendantIds(p, id)]);
    return { ...p, folders: p.folders.filter((f) => !gone.has(f.id)), favourites: p.favourites.filter((x) => !gone.has(x.replace(/^f:/, ''))) };
  });
export const moveFolderTo = (id: string, parent: string | null) =>
  updatePrefs((p) => {
    if (id === parent || (parent && descendantIds(p, id).includes(parent))) return p; // never into itself
    const order = Math.max(-1, ...p.folders.filter((f) => f.parent === parent).map((f) => f.order)) + 1;
    return { ...p, folders: p.folders.map((f) => (f.id === id ? { ...f, parent, order } : f)) };
  });
export const nudgeFolder = (id: string, dir: -1 | 1) =>
  updatePrefs((p) => {
    const me = p.folders.find((f) => f.id === id);
    if (!me) return p;
    const sibs = p.folders.filter((f) => f.parent === me.parent).sort((a, b) => a.order - b.order);
    const i = sibs.findIndex((f) => f.id === id); const j = i + dir;
    if (j < 0 || j >= sibs.length) return p;
    const swap = sibs[j];
    return { ...p, folders: p.folders.map((f) => (f.id === me.id ? { ...f, order: swap.order } : f.id === swap.id ? { ...f, order: me.order } : f)) };
  });
export const toggleFavourite = (id: string) =>
  updatePrefs((p) => ({ ...p, favourites: p.favourites.includes(id) ? p.favourites.filter((x) => x !== id) : [...p.favourites, id] }));

export function addCategory(name: string, color: string): string {
  const id = newId();
  updatePrefs((p) => ({ ...p, categories: [...p.categories, { id, name: name.trim() || 'Category', color }] }));
  return `c:${id}`;
}
export const editCategory = (id: string, name: string, color: string) =>
  updatePrefs((p) => ({ ...p, categories: p.categories.map((c) => (`c:${c.id}` === id ? { ...c, name: name.trim() || c.name, color } : c)) }));
export const removeCategory = (id: string) => updatePrefs((p) => ({ ...p, categories: p.categories.filter((c) => `c:${c.id}` !== id) }));

// ---- View settings, ignored conversations and Focused/Other choices ----
export const setReadingPane = (readingPane: ReadingPane) => updatePrefs((p) => ({ ...p, readingPane }));
export const setDensity = (density: Density) => updatePrefs((p) => ({ ...p, density }));
export const setConversations = (conversations: boolean) => updatePrefs((p) => ({ ...p, conversations }));

export function setIgnored(key: string, ignored: boolean) {
  if (!key) return;
  updatePrefs((p) => ({
    ...p,
    ignored: ignored ? (p.ignored.includes(key) ? p.ignored : [...p.ignored, key]) : p.ignored.filter((k) => k !== key),
  }));
}

/** Pass null to go back to automatic sorting for this sender. */
export function setSenderFocus(address: string, choice: 'focused' | 'other' | null) {
  const a = address.trim().toLowerCase();
  if (!a) return;
  updatePrefs((p) => {
    const next = { ...p.senderFocus };
    if (choice) next[a] = choice;
    else delete next[a];
    return { ...p, senderFocus: next };
  });
}

// ---- Sending, rules, sender lists, auto-reply ----
export const setUndoSendSeconds = (undoSendSeconds: number) => updatePrefs((p) => ({ ...p, undoSendSeconds }));
export const setAutoReply = (patch: Partial<AutoReply>) => updatePrefs((p) => ({ ...p, autoReply: { ...p.autoReply, ...patch } }));
export const markAutoReplied = (address: string, at: string) =>
  updatePrefs((p) => ({ ...p, autoReplied: { ...p.autoReplied, [address.toLowerCase()]: at } }));
export const setRulesCheckedAt = (rulesCheckedAt: string) => updatePrefs((p) => ({ ...p, rulesCheckedAt }));

export const saveRule = (rule: MailRule) =>
  updatePrefs((p) => ({ ...p, rules: p.rules.some((r) => r.id === rule.id) ? p.rules.map((r) => (r.id === rule.id ? rule : r)) : [...p.rules, rule] }));
export const removeRule = (id: string) => updatePrefs((p) => ({ ...p, rules: p.rules.filter((r) => r.id !== id) }));

type SenderList = 'blocked' | 'safe';
export function addSender(list: SenderList, entry: string) {
  const e = entry.trim().toLowerCase();
  if (!e) return;
  updatePrefs((p) => {
    const other: SenderList = list === 'blocked' ? 'safe' : 'blocked';
    return { ...p, [list]: p[list].includes(e) ? p[list] : [...p[list], e], [other]: p[other].filter((x) => x !== e) };
  });
}
export const removeSender = (list: SenderList, entry: string) => updatePrefs((p) => ({ ...p, [list]: p[list].filter((x) => x !== entry) }));

export function setScheduled(draftId: string, at: string | null) {
  updatePrefs((p) => {
    const next = { ...p.scheduled };
    if (at) next[draftId] = at;
    else delete next[draftId];
    return { ...p, scheduled: next };
  });
}

// ---- Calendars ----
/** Always at least the default calendar, even if an older record has none. */
export const calendarsOf = (p: Prefs): CalendarDef[] => (p.calendars.length ? p.calendars : DEFAULT_PREFS.calendars);
export const calendarOf = (p: Prefs, id?: string): CalendarDef => calendarsOf(p).find((c) => c.id === (id ?? DEFAULT_CALENDAR_ID)) ?? calendarsOf(p)[0];
export const addCalendar = (name: string, color: string): string => {
  const id = newId();
  updatePrefs((p) => ({ ...p, calendars: [...calendarsOf(p), { id, name: name.trim() || 'Calendar', color, visible: true }] }));
  return id;
};
export const editCalendar = (id: string, patch: Partial<Omit<CalendarDef, 'id'>>) =>
  updatePrefs((p) => ({ ...p, calendars: calendarsOf(p).map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
export const removeCalendar = (id: string) =>
  updatePrefs((p) => ({ ...p, calendars: calendarsOf(p).filter((c) => c.id !== id || c.id === DEFAULT_CALENDAR_ID) }));
export const setWeekStart = (weekStartsOn: 0 | 1) => updatePrefs((p) => ({ ...p, weekStartsOn }));
export const setSecondaryTz = (secondaryTz: string) => updatePrefs((p) => ({ ...p, secondaryTz }));
export const setShowTasksOnCalendar = (showTasksOnCalendar: boolean) => updatePrefs((p) => ({ ...p, showTasksOnCalendar }));
export const addSubscription = (name: string, url: string, color: string): string => {
  const id = newId();
  updatePrefs((p) => ({ ...p, subscriptions: [...p.subscriptions, { id, name: name.trim() || 'Internet calendar', url: url.trim(), color, visible: true }] }));
  return id;
};
export const editSubscription = (id: string, patch: Partial<Omit<Subscription, 'id'>>) =>
  updatePrefs((p) => ({ ...p, subscriptions: p.subscriptions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
export const removeSubscription = (id: string) => updatePrefs((p) => ({ ...p, subscriptions: p.subscriptions.filter((x) => x.id !== id) }));
export const setWorkingHours = (workStart: number, workEnd: number, workDays: number[]) => updatePrefs((p) => ({ ...p, workStart, workEnd, workDays }));
export const setShowWeekNumbers = (showWeekNumbers: boolean) => updatePrefs((p) => ({ ...p, showWeekNumbers }));

// ---- Saved searches, templates, quick steps, clean-up ----
export const saveSearch = (name: string, query: string): string => {
  const id = newId();
  updatePrefs((p) => ({ ...p, savedSearches: [...p.savedSearches, { id, name: name.trim() || query.slice(0, 30), query: query.trim() }] }));
  return id;
};
export const removeSearch = (id: string) => updatePrefs((p) => ({ ...p, savedSearches: p.savedSearches.filter((x) => x.id !== id) }));
export const saveTemplate = (t: Omit<MailTemplate, 'id'> & { id?: string }): string => {
  const id = t.id ?? newId();
  updatePrefs((p) => {
    const next = { id, name: t.name.trim() || 'Template', subject: t.subject, body: t.body };
    return { ...p, templates: p.templates.some((x) => x.id === id) ? p.templates.map((x) => (x.id === id ? next : x)) : [...p.templates, next] };
  });
  return id;
};
export const removeTemplate = (id: string) => updatePrefs((p) => ({ ...p, templates: p.templates.filter((x) => x.id !== id) }));
export const saveQuickStep = (q: QuickStep) =>
  updatePrefs((p) => ({ ...p, quickSteps: p.quickSteps.some((x) => x.id === q.id) ? p.quickSteps.map((x) => (x.id === q.id ? q : x)) : [...p.quickSteps, q] }));
export const removeQuickStep = (id: string) => updatePrefs((p) => ({ ...p, quickSteps: p.quickSteps.filter((x) => x.id !== id) }));
export const setAutoEmptyDays = (autoEmptyDays: number) => updatePrefs((p) => ({ ...p, autoEmptyDays }));
export const setTrashedAt = (trashedAt: Record<string, string>) => updatePrefs((p) => ({ ...p, trashedAt }));
