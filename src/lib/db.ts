import { supabase } from '@/lib/supabase';
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
  attachments?: AttachmentRow[];
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

function rowToEmail(row: EmailRow): Email {
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
  return data?.display_name ? `${data.display_name} · Veloce Mail` : 'Veloce Mail';
}

export async function saveSignature(userId: string, signature: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ signature }).eq('id', userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Emails: create / update
// ---------------------------------------------------------------------------

export async function insertEmail(
  userId: string,
  email: Omit<Email, 'id' | 'timestamp' | 'date' | 'initials' | 'attachments'>,
): Promise<Email> {
  const { data, error } = await supabase
    .from('emails')
    .insert({
      user_id: userId,
      sender: email.sender,
      sender_email: email.senderEmail,
      avatar_color: email.avatarColor,
      subject: email.subject,
      preview: email.preview,
      body: email.body,
      folder: email.folder,
      labels: email.labels,
      category: email.category,
      read: email.read,
      starred: email.starred,
      has_replies: email.hasReplies ?? false,
      snoozed_until: email.snoozedUntil ?? null,
    })
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

  const emailRows = initialEmails.map((e) => ({
    user_id: userId,
    sender: e.sender,
    sender_email: e.senderEmail,
    avatar_color: e.avatarColor,
    subject: e.subject,
    preview: e.preview,
    body: e.body,
    folder: e.folder,
    labels: e.labels,
    category: e.category,
    read: e.read,
    starred: e.starred,
    has_replies: e.hasReplies ?? false,
    snoozed_until: e.snoozedUntil ?? null,
  }));
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
