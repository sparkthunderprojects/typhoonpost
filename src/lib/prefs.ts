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
}

export const DEFAULT_PREFS: Prefs = { v: 1, folders: [], categories: [], favourites: ['inbox', 'sent', 'drafts'] };

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
