export type BuiltInFolderId =
  | 'inbox'
  | 'starred'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'trash'
  | 'spam'
  | 'snoozed';

/** A built-in folder, or one of the person's own (`f:` plus an id). Names of the latter are encrypted. */
export type FolderId = BuiltInFolderId | `f:${string}`;

/** One of the four built-in categories, or a custom one (`c:` plus an id). */
export type LabelId = string;

export const isCustomFolder = (id: string): id is `f:${string}` => id.startsWith('f:');

export type FilterTab = 'all' | 'unread' | 'starred';

export type Category = 'primary' | 'promotions' | 'social';

export interface Attachment {
  id: string;
  name: string;
  size: string;
  kind: 'image' | 'doc' | 'pdf' | 'slide' | 'sheet';
  url?: string;
  /** Present when the file itself is stored (encrypted) and can be downloaded. */
  file?: AttachmentFile;
}

export interface AttachmentFile {
  /** Name of the ciphertext object in the attachments bucket (inside the owner's folder). */
  id: string;
  /** base64 per-file key. Only ever held inside the encrypted message. */
  key: string;
  mime: string;
  bytes: number;
}

export type Importance = 'high' | 'normal' | 'low';

export interface Email {
  id: string;
  sender: string;
  senderEmail: string;
  avatarColor: string;
  initials: string;
  subject: string;
  preview: string;
  body: string;
  timestamp: string;
  date: string;
  read: boolean;
  starred: boolean;
  folder: FolderId;
  labels: LabelId[];
  category: Category;
  attachments: Attachment[];
  hasReplies?: boolean;
  snoozedUntil?: string;
  /** ISO timestamp the message was received/sent (used for date grouping). */
  createdAt?: string;
  toAddresses?: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  importance?: Importance;
  pinned?: boolean;
  followUpAt?: string;
  invite?: InvitePayload;
}

export interface ToastItem {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface LabelDef {
  id: LabelId;
  name: string;
  color: string;
}

export const LABEL_DEFS: LabelDef[] = [
  { id: 'work', name: 'Work', color: '#2563eb' },
  { id: 'personal', name: 'Personal', color: '#ec4899' },
  { id: 'urgent', name: 'Urgent', color: '#dc2626' },
  { id: 'finance', name: 'Finance', color: '#16a34a' },
];

export const FOLDER_NAMES: Record<BuiltInFolderId, string> = {
  inbox: 'Inbox',
  starred: 'Flagged',
  sent: 'Sent Items',
  drafts: 'Drafts',
  archive: 'Archive',
  trash: 'Deleted Items',
  spam: 'Junk Email',
  snoozed: 'Snoozed',
};

export type AppView = 'mail' | 'contacts' | 'calendar' | 'tasks' | 'docs';

export interface Task {
  id: string;
  title: string;
  notes: string;
  /** Due date as YYYY-MM-DD, or null. */
  due: string | null;
  /** Repeating tasks: finishing one creates the next. */
  repeat?: Repeat;
  important: boolean;
  done: boolean;
  completedAt: string | null;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  allDay: boolean;
  color: string;
  /** Which of your calendars it belongs to. Missing means the default calendar. */
  calendarId?: string;
  repeat?: Repeat;
  /** Days (YYYY-MM-DD) of a repeating event that were deleted or moved. */
  exdates?: string[];
  /** Minutes before the start to remind you. */
  reminders?: number[];
  /** The time zone the event was entered in. Times are stored as exact moments either way. */
  tz?: string;
  /** Private events show only as "Busy" to anyone a calendar is shared with. */
  visibility?: 'default' | 'private';
  /** How the time shows to others: Outlook's "Show as". Missing means busy. */
  showAs?: ShowAs;
  /** Link to an online meeting, if there is one. */
  meetingUrl?: string;
  /** Shared by everyone's copy of a meeting so replies and cancellations find it. */
  uid?: string;
  organizer?: { name: string; email: string };
  attendees?: Attendee[];
  /** Your own answer when someone else organised the meeting. */
  myStatus?: RsvpStatus;
}

export type ShowAs = 'free' | 'tentative' | 'busy' | 'oof' | 'elsewhere';
export type RsvpStatus = 'needs' | 'accepted' | 'tentative' | 'declined';
export interface Attendee {
  email: string;
  name?: string;
  role: 'required' | 'optional';
  status: RsvpStatus;
}

/** A meeting invitation, reply or cancellation carried inside an encrypted message. */
export interface InvitePayload {
  method: 'REQUEST' | 'REPLY' | 'CANCEL';
  uid: string;
  /** Goes up each time the organiser changes the meeting. */
  sequence: number;
  event: Pick<CalendarEvent, 'title' | 'description' | 'location' | 'start' | 'end' | 'allDay' | 'tz' | 'repeat' | 'exdates' | 'meetingUrl'>;
  organizer: { name: string; email: string };
  attendees: Attendee[];
  /** For a REPLY: who answered and how. */
  response?: { email: string; name?: string; status: RsvpStatus };
}

export interface Repeat {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  /** Weekly only: days of the week, 0 = Sunday. Empty means the day of the first event. */
  byDay?: number[];
  /** Last day (YYYY-MM-DD) an occurrence may start on. */
  until?: string;
  /** Total number of occurrences. */
  count?: number;
}

export const EVENT_COLORS = ['#2563eb', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899'];

export type ContactGroup = 'all' | 'frequent' | 'starred' | 'work' | 'family' | 'vendors';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  company: string;
  avatarColor: string;
  notes: string;
  groups: ContactGroup[];
  starred: boolean;
  frequent: boolean;
  createdAt: string;
}

export const CONTACT_GROUP_DEFS: { id: ContactGroup; name: string }[] = [
  { id: 'all', name: 'All Contacts' },
  { id: 'frequent', name: 'Frequent' },
  { id: 'starred', name: 'Starred' },
  { id: 'work', name: 'Work' },
  { id: 'family', name: 'Family' },
  { id: 'vendors', name: 'Vendors' },
];

export function contactName(c: Contact): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

export function contactInitials(c: Contact): string {
  return `${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase() || '?';
}
