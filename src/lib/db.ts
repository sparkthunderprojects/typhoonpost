import { supabase } from '@/lib/supabase';
import { decryptMessage, encryptMessage } from '@/lib/crypto/envelope';
import { openAttestation } from '@/lib/crypto/attest';
import { fromBase64 } from '@/lib/crypto/bytes';
import { publicKeyOf } from '@/lib/crypto/keys';
import { getPrivateKey } from '@/lib/crypto/keyStore';
import type { Attachment, CalendarEvent, Contact, ContactGroup, Email, FolderId, LabelId, Category } from '@/types';
import { initialEmails } from '@/data/mockEmails';
import { initialContacts } from '@/data/mockContacts';

// ---------------------------------------------------------------------------
// Row <-> app-model mapping
// ---------------------------------------------------------------------------

interface EmailRow {
  id: string;
  sender: string;
  sender_email: string;
  avatar_color: string;
  subject: string;
  preview: string;
  body: string;
  folder: string;
  labels: string[];
  category: string;
  read: boolean;
  starred: boolean;
  has_replies: boolean;
  snoozed_until: string | null;
  created_at: string;
  to_addresses?: string[] | null;
  attachments?: AttachmentRow[];
  enc_version?: number | null;
  enc_payload?: string | null;
  enc_key?: string | null;
  enc_attest?: string | null;
  size_bytes?: number | null;
}

interface AttachmentRow {
  id: string;
  name: string;
  size: string;
  kind: string;
  url: string | null;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  job_title: string;
  company: string;
  avatar_color: string;
  notes: string;
  groups: string[];
  starred: boolean;
  frequent: boolean;
  created_at: string;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function formatTimestamp(iso: string): { timestamp: string; date: string } {
  const created = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - created.getTime()) / 3.6e6;
  const timestamp =
    diffH < 1
      ? 'Just now'
      : diffH < 24
        ? `${Math.floor(diffH)}h ago`
        : diffH < 168
          ? `${Math.floor(diffH / 24)}d ago`
          : created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const date = created.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return { timestamp, date };
}

/**
 * Messages stored for an account with keys keep their content in an encrypted envelope; the
 * readable columns are empty. Fill them back in here, in the browser.
 */
function openRow(row: EmailRow): EmailRow {
  if (row.enc_version == null || !row.enc_payload || !row.enc_key) return row;
  const key = getPrivateKey();
  try {
    if (!key) throw new Error('locked');
    const m = decryptMessage({ version: row.enc_version, payload: row.enc_payload, key: row.enc_key }, key);
    // Mail from another Typhoonpost user carries a sealed proof of who sent it. Show that address,
    // not whatever the sender typed into the message.
    const senderEmail = row.enc_attest ? openAttestation(row.enc_attest, row.enc_payload, key).from : m.senderEmail;
    return {
      ...row,
      sender: m.sender,
      sender_email: senderEmail,
      avatar_color: m.avatarColor,
      subject: m.subject,
      preview: m.preview,
      body: m.body,
      category: m.category,
      to_addresses: m.to,
      attachments: m.attachments.map((a, i) => ({
        id: `${row.id}:${i}`,
        name: a.name,
        size: a.size,
        kind: a.kind,
        url: null,
      })),
    };
  } catch {
    return {
      ...row,
      sender: 'Unreadable message',
      subject: 'This message could not be decrypted',
      preview: 'It may be damaged, may not be from the sender it claims, or may belong to a different mailbox key.',
      body: '<p>This message could not be decrypted.</p>',
    };
  }
}

function rowToEmail(input: EmailRow): Email {
  const row = openRow(input);
  const { timestamp, date } = formatTimestamp(row.created_at);
  return {
    id: row.id,
    sender: row.sender,
    senderEmail: row.sender_email,
    avatarColor: row.avatar_color,
    initials: initialsOf(row.sender),
    subject: row.subject,
    preview: row.preview,
    body: row.body,
    timestamp,
    date,
    read: row.read,
    starred: row.starred,
    folder: row.folder as FolderId,
    labels: (row.labels || []) as LabelId[],
    category: row.category as Category,
    attachments: (row.attachments || []).map(
      (a): Attachment => ({
        id: a.id,
        name: a.name,
        size: a.size,
        kind: a.kind as Attachment['kind'],
        url: a.url ?? undefined,
      }),
    ),
    hasReplies: row.has_replies,
    snoozedUntil: row.snoozed_until ?? undefined,
    createdAt: row.created_at,
    toAddresses: row.to_addresses ?? [],
  };
}

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    company: row.company,
    avatarColor: row.avatar_color,
    notes: row.notes,
    groups: (row.groups || []) as ContactGroup[],
    starred: row.starred,
    frequent: row.frequent,
    createdAt: row.created_at.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchEmailsForUser(): Promise<Email[]> {
  const { data, error } = await supabase
    .from('emails')
    .select('*, attachments(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as EmailRow[]).map(rowToEmail);
}

export async function fetchContactsForUser(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ContactRow[]).map(rowToContact);
}

export async function fetchSignature(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('signature, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.signature) return data.signature;
  return data?.display_name ? `${data.display_name} · Typhoonpost` : 'Typhoonpost';
}

export async function saveSignature(userId: string, signature: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ signature }).eq('id', userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Emails: create / update
// ---------------------------------------------------------------------------

type NewEmail = Omit<Email, 'id' | 'timestamp' | 'date' | 'initials' | 'attachments' | 'createdAt'>;

/** The readable columns stay empty; everything describing the message goes into the envelope. */
function encryptedEmailRow(userId: string, email: NewEmail, recipientPublicKey: Uint8Array) {
  const enc = encryptMessage(
    {
      sender: email.sender,
      senderEmail: email.senderEmail,
      avatarColor: email.avatarColor,
      subject: email.subject,
      preview: email.preview,
      body: email.body,
      category: email.category as 'primary' | 'promotions',
      to: email.toAddresses ?? [],
      cc: [],
      attachments: [],
    },
    recipientPublicKey,
  );
  return {
    user_id: userId,
    folder: email.folder,
    labels: email.labels,
    read: email.read,
    starred: email.starred,
    has_replies: email.hasReplies ?? false,
    snoozed_until: email.snoozedUntil ?? null,
    size_bytes: email.body.length,
    enc_version: enc.version,
    enc_payload: enc.payload,
    enc_key: enc.key,
  };
}

function ownPublicKey(): Uint8Array {
  const key = getPrivateKey();
  if (!key) throw new Error('Your mailbox is locked. Sign in again to continue.');
  return publicKeyOf(key);
}

export async function insertEmail(userId: string, email: NewEmail): Promise<Email> {
  const { data, error } = await supabase
    .from('emails')
    .insert(encryptedEmailRow(userId, email, ownPublicKey()))
    .select('*, attachments(*)')
    .single();
  if (error) throw error;
  return rowToEmail(data as EmailRow);
}

export type EmailPatch = Partial<{
  read: boolean;
  starred: boolean;
  folder: FolderId;
  labels: LabelId[];
  snoozedUntil: string | null;
}>;

export async function updateEmail(id: string, patch: EmailPatch): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.read !== undefined) dbPatch.read = patch.read;
  if (patch.starred !== undefined) dbPatch.starred = patch.starred;
  if (patch.folder !== undefined) dbPatch.folder = patch.folder;
  if (patch.labels !== undefined) dbPatch.labels = patch.labels;
  if (patch.snoozedUntil !== undefined) dbPatch.snoozed_until = patch.snoozedUntil;
  const { error } = await supabase.from('emails').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export async function updateEmailsBulk(ids: string[], patch: EmailPatch): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.read !== undefined) dbPatch.read = patch.read;
  if (patch.starred !== undefined) dbPatch.starred = patch.starred;
  if (patch.folder !== undefined) dbPatch.folder = patch.folder;
  const { error } = await supabase.from('emails').update(dbPatch).in('id', ids);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Contacts: create / update / delete
// ---------------------------------------------------------------------------

export async function insertContact(
  userId: string,
  c: Omit<Contact, 'id' | 'createdAt'>,
): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: userId,
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      phone: c.phone,
      job_title: c.jobTitle,
      company: c.company,
      avatar_color: c.avatarColor,
      notes: c.notes,
      groups: c.groups,
      starred: c.starred,
      frequent: c.frequent,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToContact(data as ContactRow);
}

export async function updateContact(id: string, c: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (c.firstName !== undefined) dbPatch.first_name = c.firstName;
  if (c.lastName !== undefined) dbPatch.last_name = c.lastName;
  if (c.email !== undefined) dbPatch.email = c.email;
  if (c.phone !== undefined) dbPatch.phone = c.phone;
  if (c.jobTitle !== undefined) dbPatch.job_title = c.jobTitle;
  if (c.company !== undefined) dbPatch.company = c.company;
  if (c.avatarColor !== undefined) dbPatch.avatar_color = c.avatarColor;
  if (c.notes !== undefined) dbPatch.notes = c.notes;
  if (c.groups !== undefined) dbPatch.groups = c.groups;
  if (c.starred !== undefined) dbPatch.starred = c.starred;
  if (c.frequent !== undefined) dbPatch.frequent = c.frequent;
  const { error } = await supabase.from('contacts').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export async function deleteContactRow(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteContactsBulk(ids: string[]): Promise<void> {
  const { error } = await supabase.from('contacts').delete().in('id', ids);
  if (error) throw error;
}

export async function restoreContact(userId: string, c: Contact): Promise<Contact> {
  return insertContact(userId, c);
}

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

interface EventRow {
  id: string;
  title: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  color: string;
}

function rowToEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    start: row.start_time,
    end: row.end_time,
    allDay: row.all_day,
    color: row.color,
  };
}

export async function fetchEventsForUser(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('start_time', { ascending: true });
  if (error) throw error;
  return (data as EventRow[]).map(rowToEvent);
}

export async function insertEvent(
  userId: string,
  e: Omit<CalendarEvent, 'id'>,
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      user_id: userId,
      title: e.title,
      description: e.description,
      location: e.location,
      start_time: e.start,
      end_time: e.end,
      all_day: e.allDay,
      color: e.color,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToEvent(data as EventRow);
}

export async function updateEvent(id: string, e: Omit<CalendarEvent, 'id'>): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({
      title: e.title,
      description: e.description,
      location: e.location,
      start_time: e.start,
      end_time: e.end,
      all_day: e.allDay,
      color: e.color,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteEventRow(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// First-login seeding — copies the demo dataset into a brand new account
// so the app never opens to an empty inbox.
// ---------------------------------------------------------------------------

export async function seedAccountIfEmpty(userId: string): Promise<void> {
  const { count, error } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  if (count && count > 0) return;

  const pub = ownPublicKey();
  const emailRows = initialEmails.map((e) => encryptedEmailRow(userId, e, pub));
  const { error: emailErr } = await supabase.from('emails').insert(emailRows);
  if (emailErr) throw emailErr;

  const contactRows = initialContacts.map((c) => ({
    user_id: userId,
    first_name: c.firstName,
    last_name: c.lastName,
    email: c.email,
    phone: c.phone,
    job_title: c.jobTitle,
    company: c.company,
    avatar_color: c.avatarColor,
    notes: c.notes,
    groups: c.groups,
    starred: c.starred,
    frequent: c.frequent,
  }));
  const { error: contactErr } = await supabase.from('contacts').insert(contactRows);
  if (contactErr) throw contactErr;
}

// ---------------------------------------------------------------------------
// Real mail: sending (Edge Function -> Resend) and live inbox updates
// ---------------------------------------------------------------------------

export interface SendPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
}

/** Sends through the `send-email` Edge Function. Throws an Error with a readable message. */
export async function sendViaResend(payload: SendPayload): Promise<{ id: string; from: string }> {
  const { data, error } = await supabase.functions.invoke('send-email', { body: payload });
  if (error) {
    let message = 'Could not send the message';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) message = String(body.error);
      } catch {
        /* keep default */
      }
    } else if (error.message) {
      message = error.message;
    }
    throw new Error(message);
  }
  return data as { id: string; from: string };
}

/** Public keys for whichever of these addresses belong to Typhoonpost users (address → key). */
export async function lookupPublicKeys(addresses: string[]): Promise<Map<string, Uint8Array>> {
  const { data, error } = await supabase.rpc('public_keys_for_addresses', { addrs: addresses });
  if (error) throw error;
  const out = new Map<string, Uint8Array>();
  for (const row of (data ?? []) as { address: string; public_key: string }[]) {
    out.set(row.address.toLowerCase(), fromBase64(row.public_key));
  }
  return out;
}

export interface LocalDelivery {
  address: string;
  version: number;
  payload: string;
  key: string;
  size: number;
}

export interface LocalDeliveryResult {
  address: string;
  ok: boolean;
  error?: string;
}

/** Hands browser-encrypted messages to the delivery function. */
export async function deliverLocal(deliveries: LocalDelivery[]): Promise<LocalDeliveryResult[]> {
  const { data, error } = await supabase.functions.invoke('deliver-local', { body: { deliveries } });
  if (error) {
    let message = 'Could not deliver the message';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) message = String(body.error);
      } catch {
        /* keep default */
      }
    }
    throw new Error(message);
  }
  return (data as { results: LocalDeliveryResult[] }).results;
}

/** Calls `onNew` whenever a message lands in this user's mailbox. Returns an unsubscribe function. */
export function subscribeToNewEmails(userId: string, onNew: (email: Email) => void): () => void {
  const channel = supabase
    .channel(`emails:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'emails', filter: `user_id=eq.${userId}` },
      async (payload) => {
        const id = (payload.new as { id?: string }).id;
        if (!id) return;
        // Re-read so attachments are included.
        const { data } = await supabase.from('emails').select('*, attachments(*)').eq('id', id).maybeSingle();
        if (data) onNew(rowToEmail(data as EmailRow));
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** The signed-in user's own Typhoonpost address (null until assigned). */
export async function fetchMyAddress(): Promise<string | null> {
  const { data } = await supabase.from('mailboxes').select('address').maybeSingle();
  return data?.address ?? null;
}

/** Claim a different handle; returns the new full address. */
export async function claimAddress(handle: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_mailbox', { handle });
  if (error) throw new Error(error.message);
  return data as string;
}
