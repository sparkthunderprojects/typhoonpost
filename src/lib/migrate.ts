import { supabase } from '@/lib/supabase';
import { encryptMessage, type PayloadAttachment } from '@/lib/crypto/envelope';
import { eventPayload, ownPublicKey, pickContact, rowToContact, rowToEvent, sealRecord, type ContactRow, type EventRow } from '@/lib/db';

/**
 * Moves anything stored in the clear before encryption existed into encrypted form. It runs in the
 * browser, because only the browser holds the key. Safe to run more than once and safe to stop
 * halfway: each row is updated only while it is still unencrypted, and the readable columns are
 * emptied in the same update that stores the ciphertext, so a row is never half-converted.
 */
export interface MigrationResult {
  emails: number;
  contacts: number;
  events: number;
  failed: number;
}

const PAGE = 100;

interface LegacyEmail {
  id: string;
  sender: string;
  sender_email: string;
  avatar_color: string;
  subject: string;
  preview: string;
  body: string;
  category: string;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  attachments?: { name: string; size: string; kind: string }[];
}

/** Rows that still hold readable content, oldest page first. Rows already tried are skipped. */
async function nextPage<T>(table: string, select: string, skip: Set<string>): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(select).is('enc_version', null).limit(PAGE + skip.size);
  if (error) throw error;
  return (data as unknown as (T & { id: string })[]).filter((r) => !skip.has(r.id)).slice(0, PAGE);
}

export async function migrateLegacyData(): Promise<MigrationResult> {
  const pub = ownPublicKey();
  const result: MigrationResult = { emails: 0, contacts: 0, events: 0, failed: 0 };

  // ---- messages
  const triedEmails = new Set<string>();
  for (;;) {
    const rows = await nextPage<LegacyEmail>('emails', '*, attachments(*)', triedEmails);
    if (!rows.length) break;
    for (const row of rows) {
      triedEmails.add(row.id);
      try {
        const attachments: PayloadAttachment[] = (row.attachments ?? []).map((a) => ({
          name: a.name,
          size: a.size,
          kind: a.kind as PayloadAttachment['kind'],
        }));
        const enc = encryptMessage(
          {
            sender: row.sender,
            senderEmail: row.sender_email,
            avatarColor: row.avatar_color,
            subject: row.subject,
            preview: row.preview,
            body: row.body,
            category: row.category === 'promotions' ? 'promotions' : 'primary',
            to: row.to_addresses ?? [],
            cc: row.cc_addresses ?? [],
            attachments,
          },
          pub,
        );
        const { data, error } = await supabase
          .from('emails')
          .update({
            enc_version: enc.version,
            enc_payload: enc.payload,
            enc_key: enc.key,
            size_bytes: row.body.length,
            sender: '',
            sender_email: '',
            avatar_color: '#2563eb',
            subject: '',
            preview: '',
            body: '',
            category: 'primary',
            to_addresses: [],
            cc_addresses: [],
          })
          .eq('id', row.id)
          .is('enc_version', null)
          .select('id');
        if (error) throw error;
        // No row back means it was converted elsewhere in the meantime. Either way it is done.
        if (data?.length && attachments.length) {
          await supabase.from('attachments').delete().eq('email_id', row.id);
        }
        result.emails += data?.length ?? 0;
      } catch {
        result.failed++;
      }
    }
  }

  // ---- contacts
  const triedContacts = new Set<string>();
  for (;;) {
    const rows = await nextPage<ContactRow>('contacts', '*', triedContacts);
    if (!rows.length) break;
    for (const row of rows) {
      triedContacts.add(row.id);
      try {
        const c = rowToContact(row);
        const { data, error } = await supabase
          .from('contacts')
          .update({
            ...sealRecord('contact', pickContact(c)),
            first_name: '', last_name: '', email: '', phone: '', job_title: '', company: '', notes: '',
            avatar_color: '#2563eb', groups: [], starred: false, frequent: false,
          })
          .eq('id', row.id)
          .is('enc_version', null)
          .select('id');
        if (error) throw error;
        result.contacts += data?.length ?? 0;
      } catch {
        result.failed++;
      }
    }
  }

  // ---- calendar events
  const triedEvents = new Set<string>();
  for (;;) {
    const rows = await nextPage<EventRow>('events', '*', triedEvents);
    if (!rows.length) break;
    for (const row of rows) {
      triedEvents.add(row.id);
      try {
        const { id: _id, ...ev } = rowToEvent(row);
        void _id;
        const { data, error } = await supabase
          .from('events')
          .update({
            ...sealRecord('event', eventPayload(ev)),
            title: '', description: '', location: '', start_time: null, end_time: null, all_day: false, color: '#2563eb',
          })
          .eq('id', row.id)
          .is('enc_version', null)
          .select('id');
        if (error) throw error;
        result.events += data?.length ?? 0;
      } catch {
        result.failed++;
      }
    }
  }

  return result;
}
