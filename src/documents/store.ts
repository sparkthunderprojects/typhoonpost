import { supabase } from '../lib/supabase';
import { decryptRecord, encryptRecord, type EncryptedRecord } from '../lib/crypto/record';
import { getPrivateKey } from '../lib/crypto/keyStore';
import { ownPublicKey } from '../lib/db';
import { buildMeta } from './format';
import { EMPTY_DOC, MAX_DOC_BYTES, type DocBody, type DocMeta, type DocSummary, type DocVersion, type PMNode } from './types';

/**
 * Storage for Documents. A document is two encrypted records (a small one for the list, one for the
 * body). The server only ever holds ciphertext plus ids, timestamps, size, star, trash and a
 * revision counter that lets two saves notice they disagree.
 */

interface Row {
  id: string;
  meta_version: number; meta_payload: string; meta_key: string;
  enc_version?: number; enc_payload?: string; enc_key?: string;
  size_bytes: number; revision: number; starred: boolean; trashed_at: string | null;
  created_at: string; updated_at: string;
}

const LIST_COLUMNS = 'id,meta_version,meta_payload,meta_key,size_bytes,revision,starred,trashed_at,created_at,updated_at';

const seal = (kind: 'doc' | 'docmeta', value: unknown): EncryptedRecord => encryptRecord(kind, value, ownPublicKey());

function open<T>(kind: 'doc' | 'docmeta', e: EncryptedRecord): T {
  const key = getPrivateKey();
  if (!key) throw new Error('Your keys are locked.');
  return decryptRecord<T>(kind, e, key);
}

function summary(r: Row): DocSummary {
  const base = { id: r.id, starred: r.starred, trashedAt: r.trashed_at, sizeBytes: r.size_bytes, revision: r.revision, createdAt: r.created_at, updatedAt: r.updated_at };
  try {
    return { ...base, ...open<DocMeta>('docmeta', { version: r.meta_version, payload: r.meta_payload, key: r.meta_key }) };
  } catch {
    return { ...base, title: 'This document could not be decrypted', excerpt: '', words: 0, undecryptable: true };
  }
}

export class ConflictError extends Error {
  constructor() { super('This document changed somewhere else.'); this.name = 'ConflictError'; }
}
export class TooLargeError extends Error {
  constructor() { super('This document is too large to save. Remove some images and try again.'); this.name = 'TooLargeError'; }
}

export async function listDocuments(): Promise<DocSummary[]> {
  const { data, error } = await supabase.from('documents').select(LIST_COLUMNS).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(summary);
}

export async function openDocument(id: string): Promise<{ summary: DocSummary; body: DocBody }> {
  const { data, error } = await supabase.from('documents').select('*').eq('id', id).single();
  if (error) throw error;
  const row = data as Row;
  const body = open<DocBody>('doc', { version: row.enc_version!, payload: row.enc_payload!, key: row.enc_key! });
  return { summary: summary(row), body: migrateBody(body) };
}

/** Old formats always open. Version 1 is the only one so far; later releases add steps here. */
export function migrateBody(b: DocBody): DocBody {
  if (!b || typeof b !== 'object' || !b.doc) throw new Error('This document is in a format Typhoonpost does not recognise.');
  return { v: 1, doc: b.doc, page: { size: b.page?.size === 'letter' ? 'letter' : 'a4' } };
}

function sealParts(title: string, body: DocBody) {
  const json = JSON.stringify(body);
  const size = new TextEncoder().encode(json).length;
  if (size > MAX_DOC_BYTES) throw new TooLargeError();
  const meta = seal('docmeta', buildMeta(title, body.doc));
  const content = seal('doc', body);
  return {
    size,
    cols: {
      meta_version: meta.version, meta_payload: meta.payload, meta_key: meta.key,
      enc_version: content.version, enc_payload: content.payload, enc_key: content.key,
      size_bytes: size,
    },
  };
}

export async function createDocument(userId: string, title: string, doc: PMNode = EMPTY_DOC): Promise<DocSummary> {
  const body: DocBody = { v: 1, doc, page: { size: 'a4' } };
  const { cols } = sealParts(title, body);
  const { data, error } = await supabase.from('documents').insert({ user_id: userId, ...cols }).select(LIST_COLUMNS).single();
  if (error) throw error;
  return summary(data as Row);
}

/** Saves only if nobody else saved since `revision`. A mismatch is reported, never overwritten. */
export async function saveDocument(id: string, revision: number, title: string, body: DocBody): Promise<DocSummary> {
  const { cols } = sealParts(title, body);
  const { data, error } = await supabase
    .from('documents')
    .update({ ...cols, revision: revision + 1, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('revision', revision)
    .select(LIST_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ConflictError();
  return summary(data as Row);
}

export async function setStarred(id: string, starred: boolean) {
  const { error } = await supabase.from('documents').update({ starred }).eq('id', id);
  if (error) throw error;
}
export async function setTrashed(id: string, trashed: boolean) {
  const { error } = await supabase.from('documents').update({ trashed_at: trashed ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw error;
}
export async function deleteDocumentForever(id: string) {
  clearPending(id);
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicateDocument(userId: string, id: string): Promise<DocSummary> {
  const { summary: s, body } = await openDocument(id);
  const copy = await createDocument(userId, `Copy of ${s.title}`, body.doc);
  return copy;
}

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

const MAX_VERSIONS = 30;

export async function snapshotVersion(documentId: string, userId: string, title: string, body: DocBody, label: string | null): Promise<void> {
  const { cols } = sealParts(title, body);
  const { error } = await supabase.from('document_versions').insert({
    document_id: documentId, user_id: userId, label,
    enc_version: cols.enc_version, enc_payload: cols.enc_payload, enc_key: cols.enc_key,
    meta_version: cols.meta_version, meta_payload: cols.meta_payload, meta_key: cols.meta_key,
  });
  if (error) throw error;
  const { data } = await supabase.from('document_versions').select('id').eq('document_id', documentId).order('created_at', { ascending: false });
  const extra = (data ?? []).slice(MAX_VERSIONS).map((r: { id: string }) => r.id);
  if (extra.length) await supabase.from('document_versions').delete().in('id', extra);
}

export async function listVersions(documentId: string): Promise<DocVersion[]> {
  const { data, error } = await supabase
    .from('document_versions')
    .select('id,label,created_at,meta_version,meta_payload,meta_key')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: { id: string; label: string | null; created_at: string; meta_version: number; meta_payload: string; meta_key: string }) => {
    try {
      const m = open<DocMeta>('docmeta', { version: r.meta_version, payload: r.meta_payload, key: r.meta_key });
      return { id: r.id, label: r.label, createdAt: r.created_at, title: m.title, words: m.words };
    } catch {
      return { id: r.id, label: r.label, createdAt: r.created_at, title: 'Could not be decrypted', words: 0 };
    }
  });
}

export async function openVersion(id: string): Promise<DocBody> {
  const { data, error } = await supabase.from('document_versions').select('enc_version,enc_payload,enc_key').eq('id', id).single();
  if (error) throw error;
  const r = data as { enc_version: number; enc_payload: string; enc_key: string };
  return migrateBody(open<DocBody>('doc', { version: r.enc_version, payload: r.enc_payload, key: r.enc_key }));
}

// ---------------------------------------------------------------------------
// Local safety copy: an encrypted copy of unsaved work kept on this device
// ---------------------------------------------------------------------------

const pendingKey = (id: string) => `typhoonpost:doc-pending:${id}`;

export interface Pending { revision: number; title: string; body: DocBody; at: number }

export function writePending(id: string, p: Pending): boolean {
  try {
    const e = seal('doc', p);
    localStorage.setItem(pendingKey(id), JSON.stringify(e));
    return true;
  } catch {
    return false; // storage full or blocked: the server save still runs
  }
}

export function readPending(id: string): Pending | null {
  try {
    const raw = localStorage.getItem(pendingKey(id));
    if (!raw) return null;
    return open<Pending>('doc', JSON.parse(raw) as EncryptedRecord);
  } catch {
    return null;
  }
}

export function clearPending(id: string) {
  try { localStorage.removeItem(pendingKey(id)); } catch { /* ignore */ }
}

export function pendingIds(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('typhoonpost:doc-pending:')) out.push(k.slice('typhoonpost:doc-pending:'.length));
    }
  } catch { /* ignore */ }
  return out;
}
