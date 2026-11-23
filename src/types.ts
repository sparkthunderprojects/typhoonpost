export type FolderId =
  | 'inbox'
  | 'starred'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'trash'
  | 'spam'
  | 'snoozed';

export type LabelId = 'work' | 'personal' | 'urgent' | 'finance';

export type FilterTab = 'all' | 'unread' | 'starred';

export type Category = 'primary' | 'promotions' | 'social';

export interface Attachment {
  id: string;
  name: string;
  size: string;
  kind: 'image' | 'doc' | 'pdf' | 'slide' | 'sheet';
  url?: string;
}

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

export const FOLDER_NAMES: Record<FolderId, string> = {
  inbox: 'Inbox',
  starred: 'Starred',
  sent: 'Sent',
  drafts: 'Drafts',
  archive: 'Archive',
  trash: 'Trash',
  spam: 'Spam',
  snoozed: 'Snoozed',
};

export type AppView = 'mail' | 'contacts' | 'calendar';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  allDay: boolean;
  color: string;
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
