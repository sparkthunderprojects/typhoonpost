import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  Inbox,
  Flag,
  Send,
  FileText,
  Folder as FolderIcon,
  Archive,
  Trash2,
  ShieldAlert,
  Clock,
  Mail,
  CalendarDays,
  Users,
  PenSquare,
  Moon,
  Settings as SettingsIcon,
  Keyboard,
  LogOut,
  CalendarPlus,
  UserPlus,
  Tag,
  CheckSquare,
} from 'lucide-react';
import type { Email, FolderId, LabelId, FilterTab, Category, AppView, Contact, ContactGroup, CalendarEvent, Task, Attachment, Importance } from '@/types';
import { contactName, EVENT_COLORS } from '@/types';
import {
  addSender, categoryDefs, folderName, folderTree, getPrefs, loadPrefs, markAutoReplied, newId, resetPrefs, saveRule, setIgnored,
  setRulesCheckedAt, setScheduled, setSenderFocus, usePrefs,
} from '@/lib/prefs';
import { decide, emptyRule, listMatches, shouldAutoReply, type RulePatch } from '@/lib/rules';
import { MailSettingsDialog } from '@/components/MailSettingsDialog';
import { useTheme } from '@/hooks/useTheme';
import { useToasts } from '@/hooks/useToasts';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  fetchEmailsForUser,
  subscribeToNewEmails,
  fetchMyAddress,
  claimAddress,
  fetchContactsForUser,
  fetchSignature,
  saveSignature,
  seedAccountIfEmpty,
  updateEmail as dbUpdateEmail,
  updateEmailsBulk,
  insertContact,
  updateContact as dbUpdateContact,
  deleteContactRow,
  deleteContactsBulk,
  restoreContact,
  fetchEventsForUser,
  insertEvent as insertEventDb,
  updateEvent as updateEventDb,
  deleteEventRow,
  fetchTasksForUser,
  insertTask,
  updateTask as updateTaskDb,
  deleteTaskRow,
  saveDraft,
  deleteEmailRow,
  uploadAttachment,
  removeAttachmentFiles,
  downloadAttachment,
  lookupPublicKeys,
} from '@/lib/db';
import { contactMatches, emailMatches, eventMatches, filterBy } from '@/lib/search';
import { TasksView } from '@/components/TasksView';
const DocsView = lazy(() => import('@/documents/DocsView'));
import { migrateLegacyData, type MigrationResult } from '@/lib/migrate';
import type { PayloadAttachment } from '@/lib/crypto/envelope';
import { AuthScreen } from '@/components/AuthScreen';
import { sendMessage } from '@/lib/outgoing';
import { RecoveryKeyScreen, UnlockScreen } from '@/components/KeyScreens';
import { CalendarView } from '@/components/CalendarView';
import { EventForm } from '@/components/EventForm';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { AppRail } from '@/components/AppRail';
import { CommandBar } from '@/components/CommandBar';
import { CommandPalette, type PaletteCommand } from '@/components/CommandPalette';
import { Logo } from '@/components/Logo';
import { EmailList } from '@/components/EmailList';
import { EmailReader } from '@/components/EmailReader';
import { Composer, type ComposerState, type ComposeData } from '@/components/Composer';
import { conversationOf, isFocused, threadKey } from '@/lib/thread';
import { downloadText, fileNameFor, printEmail, toEml } from '@/lib/export';
import { followUpTaskTitle, followUpTimestamp } from '@/lib/followup';
import { dateKey, dueReminders, nextDue, REMINDER_CHOICES, shortTime } from '@/lib/calendar';
import { buildReply, type ReplyMode } from '@/lib/reply';
import { processMail } from '@/lib/privacy';
import type { Recipient } from '@/components/RecipientField';
import { ShortcutGuide } from '@/components/ShortcutGuide';
import { SettingsModal } from '@/components/SettingsModal';
import { MfaScreen } from '@/components/MfaScreen';
import { ToastContainer } from '@/components/ToastContainer';
import { ContactsView } from '@/components/ContactsView';
import { ContactDetail } from '@/components/ContactDetail';
import { ContactForm } from '@/components/ContactForm';
import type { SnoozeOption } from '@/components/SnoozeMenu';

const SNOOZE_LABELS: Record<SnoozeOption, string> = {
  'later-today': 'Later today',
  tomorrow: 'Tomorrow',
  'next-week': 'Next week',
};

interface MailAppProps {
  userId: string;
  userEmail: string;
  onSignOut: () => void;
  onChangePassword: (current: string, next: string) => Promise<void>;
}

function MailApp({ userId, userEmail, onSignOut, onChangePassword }: MailAppProps) {
  const { theme, toggle } = useTheme();
  const { toasts, push, dismiss } = useToasts();
  const prefs = usePrefs();

  // ---- Mail state ----
  const [emails, setEmails] = useState<Email[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<FolderId>('inbox');
  const [activeLabel, setActiveLabel] = useState<LabelId | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [category, setCategory] = useState<Category>('primary');
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [mailSettingsOpen, setMailSettingsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [listCollapsed, setListCollapsed] = useState(false);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [myAddress, setMyAddress] = useState<string | null>(null);

  // ---- App view ----
  const [view, setView] = useState<AppView>('mail');

  // ---- Calendar state ----
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [newEventStart, setNewEventStart] = useState<string | undefined>(undefined);

  // ---- Tasks and calendar search ----
  const [tasks, setTasks] = useState<Task[]>([]);
  const [docQuery, setDocQuery] = useState('');
  const [taskQuery, setTaskQuery] = useState('');
  const [eventQuery, setEventQuery] = useState('');

  // ---- Contacts state ----
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContactGroup, setActiveContactGroup] = useState<ContactGroup>('all');
  const [contactQuery, setContactQuery] = useState('');
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // ---- Composer / modals ----
  const [composerState, setComposerState] = useState<ComposerState>('closed');
  const [composerPrefillTo, setComposerPrefillTo] = useState<Recipient[] | undefined>(undefined);
  const [composerPrefillSubject, setComposerPrefillSubject] = useState<string | undefined>(undefined);
  const [composerPrefillCc, setComposerPrefillCc] = useState<Recipient[] | undefined>(undefined);
  const [composerPrefillBcc, setComposerPrefillBcc] = useState<Recipient[] | undefined>(undefined);
  const [composerPrefillImportance, setComposerPrefillImportance] = useState<Importance | undefined>(undefined);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signature, setSignatureState] = useState('');

  // ---- Load this account's data from Supabase on mount ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      setDataError(null);
      resetPrefs();
      try {
        await seedAccountIfEmpty(userId);
        // Anything stored before encryption existed is encrypted here, in the browser.
        let migrated: MigrationResult | null = null;
        try {
          migrated = await migrateLegacyData();
        } catch {
          /* the next visit tries again; unconverted items still display */
        }
        const [loadedEmails, loadedContacts, loadedSignature, loadedEvents, loadedTasks] = await Promise.all([
          fetchEmailsForUser(),
          fetchContactsForUser(),
          fetchSignature(userId),
          fetchEventsForUser(),
          fetchTasksForUser(),
        ]);
        await loadPrefs().catch(() => undefined);
        if (cancelled) return;
        setEmails(loadedEmails);
        setContacts(loadedContacts);
        setSignatureState(loadedSignature);
        setEvents(loadedEvents);
        setTasks(loadedTasks);
        setActiveId(loadedEmails.find((e) => e.folder === 'inbox')?.id ?? loadedEmails[0]?.id ?? null);
        if (migrated) {
          const n = migrated.emails + migrated.contacts + migrated.events;
          if (n > 0) push(`Encrypted ${n} older item${n === 1 ? '' : 's'} in your account`);
          if (migrated.failed > 0) push(`${migrated.failed} older item${migrated.failed === 1 ? '' : 's'} could not be encrypted yet and will be retried`);
        }
      } catch (err) {
        if (cancelled) return;
        setDataError(err instanceof Error ? err.message : 'Failed to load your mailbox');
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ---- Live inbox: new mail appears the moment it arrives ----
  useEffect(() => {
    fetchMyAddress().then(setMyAddress).catch(() => {});
    return subscribeToNewEmails(userId, (email) => {
      setEmails((prev) => (prev.some((e) => e.id === email.id) ? prev : [email, ...prev]));
      if (email.folder === 'inbox') push(`New mail from ${email.sender}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const changeAddress = useCallback(async (handle: string) => {
    const addr = await claimAddress(handle);
    setMyAddress(addr);
    return addr;
  }, []);

  const setSignature = useCallback(
    (s: string) => {
      setSignatureState(s);
      saveSignature(userId, s).catch(() => push('Failed to save signature'));
    },
    [userId, push],
  );

  // ---- Derived mail list ----
  const visibleEmails = useMemo(() => {
    let list = emails;
    if (activeLabel) {
      list = list.filter((e) => e.labels.includes(activeLabel));
    } else if (activeFolder === 'starred') {
      list = list.filter((e) => e.starred && e.folder !== 'trash' && e.folder !== 'spam');
    } else {
      list = list.filter((e) => e.folder === activeFolder);
    }
    if (activeFolder === 'inbox' && !activeLabel) {
      // Focused = primary; Other = promotions + social
      list = list.filter((e) => isFocused(e, prefs.senderFocus) === (category === 'primary'));
    }
    if (filter === 'unread') list = list.filter((e) => !e.read);
    if (filter === 'starred') list = list.filter((e) => e.starred);
    list = filterBy(list, query, emailMatches);
    if (list.some((e) => e.pinned)) list = [...list.filter((e) => e.pinned), ...list.filter((e) => !e.pinned)];
    return list;
  }, [emails, activeFolder, activeLabel, category, filter, query, prefs.senderFocus]);

  const activeEmail = useMemo(
    () => emails.find((e) => e.id === activeId) ?? null,
    [emails, activeId],
  );

  // With the reading pane off, going to another folder or switching the pane off returns to the list.
  useEffect(() => setReaderOpen(false), [activeFolder, activeLabel, prefs.readingPane]);

  const conversation = useMemo(() => (activeEmail ? conversationOf(activeEmail, emails) : []), [activeEmail, emails]);
  const activeKey = activeEmail ? threadKey(activeEmail) : '';
  const activeIgnored = Boolean(activeKey) && prefs.ignored.includes(activeKey);
  const activeFocus = activeEmail ? prefs.senderFocus[activeEmail.senderEmail.toLowerCase()] ?? null : null;

  // ---- Mail counts ----
  const counts = useMemo(() => {
    const c: Record<string, number> = { inbox: 0, starred: 0, sent: 0, drafts: 0, archive: 0, trash: 0, spam: 0, snoozed: 0 };
    for (const e of emails) {
      if (!e.read) c[e.folder] = (c[e.folder] ?? 0) + 1;
    }
    c.starred = emails.filter((e) => e.starred).length;
    c.snoozed = emails.filter((e) => e.folder === 'snoozed').length;
    return c;
  }, [emails]);

  const labelCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of emails) {
      if (!e.read) for (const l of e.labels) c[l] = (c[l] ?? 0) + 1;
    }
    return c;
  }, [emails]);

  // ---- Contacts derived ----
  const visibleContacts = useMemo(() => {
    let list = contacts;
    if (activeContactGroup === 'starred') list = list.filter((c) => c.starred);
    else if (activeContactGroup === 'frequent') list = list.filter((c) => c.frequent);
    else if (activeContactGroup !== 'all') list = list.filter((c) => c.groups.includes(activeContactGroup));
    list = filterBy(list, contactQuery, contactMatches);
    return list;
  }, [contacts, activeContactGroup, contactQuery]);

  const contactGroupCounts = useMemo(() => {
    const c: Record<ContactGroup, number> = {
      all: contacts.length,
      frequent: contacts.filter((c) => c.frequent).length,
      starred: contacts.filter((c) => c.starred).length,
      work: contacts.filter((c) => c.groups.includes('work')).length,
      family: contacts.filter((c) => c.groups.includes('family')).length,
      vendors: contacts.filter((c) => c.groups.includes('vendors')).length,
    };
    return c;
  }, [contacts]);

  const activeContact = useMemo(
    () => contacts.find((c) => c.id === activeContactId) ?? null,
    [contacts, activeContactId],
  );

  const contactRecentEmails = useMemo(() => {
    if (!activeContact) return [];
    return emails.filter((e) => e.senderEmail.toLowerCase() === activeContact.email.toLowerCase()).slice(0, 5);
  }, [activeContact, emails]);

  const allContactsSelected =
    visibleContacts.length > 0 && visibleContacts.every((c) => selectedContactIds.has(c.id));

  // ---- Mail actions ----
  const openEmail = useCallback((id: string) => {
    setActiveId(id);
    setReaderOpen(true);
    setEmails((prev) => prev.map((e) => (e.id === id && !e.read ? { ...e, read: true } : e)));
    dbUpdateEmail(id, { read: true }).catch(() => {});
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleStar = useCallback((id: string) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const starred = !e.starred;
        dbUpdateEmail(id, { starred }).catch(() => {});
        return { ...e, starred };
      }),
    );
  }, []);

  const toggleLabel = useCallback((id: string, label: LabelId) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const has = e.labels.includes(label);
        const labels = has ? e.labels.filter((l) => l !== label) : [...e.labels, label];
        dbUpdateEmail(id, { labels }).catch(() => {});
        return { ...e, labels };
      }),
    );
  }, []);

  const advanceSelection = useCallback(
    (currentId: string, dir: 1 | -1) => {
      const idx = visibleEmails.findIndex((e) => e.id === currentId);
      if (idx === -1) return;
      const next = visibleEmails[idx + dir];
      if (next) setActiveId(next.id);
    },
    [visibleEmails],
  );

  const archiveEmail = useCallback(
    (id: string) => {
      const email = emails.find((e) => e.id === id);
      if (!email) return;
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, folder: 'archive' } : e)));
      dbUpdateEmail(id, { folder: 'archive' }).catch(() => {});
      push(`Archived “${email.subject.slice(0, 40)}”`, 'Undo', () => {
        setEmails((prev) => prev.map((e) => (e.id === id ? { ...email, folder: 'inbox' } : e)));
        dbUpdateEmail(id, { folder: 'inbox' }).catch(() => {});
      });
      if (activeId === id) advanceSelection(id, 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emails, activeId, push],
  );

  const deleteEmail = useCallback(
    (id: string) => {
      const email = emails.find((e) => e.id === id);
      if (!email) return;
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, folder: 'trash' } : e)));
      dbUpdateEmail(id, { folder: 'trash' }).catch(() => {});
      push('Moved to Deleted Items', 'Undo', () => {
        setEmails((prev) => prev.map((e) => (e.id === id ? { ...email, folder: 'inbox' } : e)));
        dbUpdateEmail(id, { folder: 'inbox' }).catch(() => {});
      });
      if (activeId === id) advanceSelection(id, 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emails, activeId, push],
  );

  const markUnread = useCallback((id: string) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, read: false } : e)));
    dbUpdateEmail(id, { read: false }).catch(() => {});
  }, []);

  const toggleRead = useCallback((id: string) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const read = !e.read;
        dbUpdateEmail(id, { read }).catch(() => {});
        return { ...e, read };
      }),
    );
  }, []);

  const moveEmail = useCallback(
    (id: string, folder: FolderId) => {
      const email = emails.find((e) => e.id === id);
      if (!email || email.folder === folder) return;
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, folder, snoozedUntil: undefined } : e)));
      dbUpdateEmail(id, { folder }).catch(() => {});
      push(`Moved to ${folderName(folder)}`, 'Undo', () => {
        setEmails((prev) => prev.map((e) => (e.id === id ? { ...email } : e)));
        dbUpdateEmail(id, { folder: email.folder }).catch(() => {});
      });
      if (activeId === id) advanceSelection(id, 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emails, activeId, push],
  );

  /** Drop or bulk move: any number of messages into any folder, with one undo. */
  const moveMany = useCallback(
    (ids: string[], folder: FolderId) => {
      const picked = emails.filter((e) => ids.includes(e.id) && e.folder !== folder);
      if (!picked.length) return;
      const before = new Map(picked.map((e) => [e.id, e]));
      setEmails((prev) => prev.map((e) => (before.has(e.id) ? { ...e, folder, snoozedUntil: undefined } : e)));
      updateEmailsBulk(picked.map((e) => e.id), { folder }).catch(() => {});
      push(`Moved ${picked.length === 1 ? '1 message' : `${picked.length} messages`} to ${folderName(folder)}`, 'Undo', () => {
        setEmails((prev) => prev.map((e) => before.get(e.id) ?? e));
        for (const e of picked) dbUpdateEmail(e.id, { folder: e.folder, snoozedUntil: e.snoozedUntil ?? null }).catch(() => {});
      });
      setSelectedIds(new Set());
      if (activeId && before.has(activeId)) setActiveId(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emails, activeId, push],
  );

  const addLabelMany = useCallback(
    (ids: string[], label: LabelId) => {
      const picked = emails.filter((e) => ids.includes(e.id) && !e.labels.includes(label));
      if (!picked.length) return;
      setEmails((prev) => prev.map((e) => (picked.some((p) => p.id === e.id) ? { ...e, labels: [...e.labels, label] } : e)));
      for (const e of picked) dbUpdateEmail(e.id, { labels: [...e.labels, label] }).catch(() => {});
      push(`Categorised ${picked.length === 1 ? '1 message' : `${picked.length} messages`}`, 'Undo', () => {
        setEmails((prev) => prev.map((e) => picked.find((p) => p.id === e.id) ?? e));
        for (const e of picked) dbUpdateEmail(e.id, { labels: e.labels }).catch(() => {});
      });
    },
    [emails, push],
  );

  const folderDeleted = useCallback(
    (folderIds: FolderId[]) => {
      const ids = emails.filter((e) => folderIds.includes(e.folder)).map((e) => e.id);
      if (!ids.length) return;
      setEmails((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, folder: 'inbox' } : e)));
      updateEmailsBulk(ids, { folder: 'inbox' }).catch(() => {});
    },
    [emails],
  );

  /** Quiet move to Deleted Items, used for ignored conversations. Returns what it moved. */
  const trashQuietly = useCallback(
    (ids: string[]): Email[] => {
      const picked = emails.filter((e) => ids.includes(e.id) && e.folder !== 'trash');
      if (!picked.length) return [];
      const set = new Set(picked.map((e) => e.id));
      setEmails((prev) => prev.map((e) => (set.has(e.id) ? { ...e, folder: 'trash', snoozedUntil: undefined } : e)));
      updateEmailsBulk([...set], { folder: 'trash' }).catch(() => {});
      if (activeId && set.has(activeId)) setActiveId(null);
      return picked;
    },
    [emails, activeId],
  );

  /** Ignoring sends the whole conversation, now and later, to Deleted Items. */
  const toggleIgnore = useCallback(
    (email: Email) => {
      const key = threadKey(email);
      if (!key) {
        push('Messages without a subject cannot be ignored as a conversation');
        return;
      }
      if (prefs.ignored.includes(key)) {
        setIgnored(key, false);
        push('Conversation is no longer ignored');
        return;
      }
      setIgnored(key, true);
      const moved = trashQuietly(emails.filter((e) => threadKey(e) === key && e.folder === 'inbox').map((e) => e.id));
      push('Conversation ignored. It and any new replies go to Deleted Items', 'Undo', () => {
        setIgnored(key, false);
        setEmails((prev) => prev.map((e) => moved.find((m) => m.id === e.id) ?? e));
        for (const m of moved) dbUpdateEmail(m.id, { folder: m.folder }).catch(() => {});
      });
    },
    [prefs.ignored, emails, trashQuietly, push],
  );

  // Mail that arrives later in an ignored conversation goes straight to Deleted Items.
  useEffect(() => {
    if (!prefs.ignored.length) return;
    const ids = emails.filter((e) => e.folder === 'inbox' && prefs.ignored.includes(threadKey(e))).map((e) => e.id);
    if (ids.length) trashQuietly(ids);
  }, [emails, prefs.ignored, trashQuietly]);

  const fromSender = useCallback(
    (address: string, folder: FolderId) => emails.filter((e) => e.senderEmail.toLowerCase() === address.toLowerCase() && e.folder === folder),
    [emails],
  );

  const blockSender = useCallback(
    (email: Email) => {
      addSender('blocked', email.senderEmail);
      moveMany(fromSender(email.senderEmail, 'inbox').map((e) => e.id), 'spam');
    },
    [fromSender, moveMany],
  );

  const markSafe = useCallback(
    (email: Email) => {
      addSender('safe', email.senderEmail);
      moveMany(fromSender(email.senderEmail, 'spam').map((e) => e.id), 'inbox');
      push(`${email.senderEmail} is now a safe sender`);
    },
    [fromSender, moveMany, push],
  );

  const sweepSender = useCallback(
    (email: Email, kind: 'archive' | 'delete') => {
      const ids = fromSender(email.senderEmail, 'inbox').map((e) => e.id);
      if (kind === 'delete') {
        saveRule({ ...emptyRule(newId()), name: `Delete mail from ${email.senderEmail}`, from: email.senderEmail, delete: true });
      }
      if (ids.length) moveMany(ids, kind === 'archive' ? 'archive' : 'trash');
      else push(kind === 'delete' ? 'Future mail from this sender will go to Deleted Items' : 'Nothing to sweep');
    },
    [fromSender, moveMany, push],
  );

  const cleanUpConversation = useCallback(
    (email: Email) => {
      const inInbox = conversationOf(email, emails).filter((e) => e.folder === 'inbox');
      const older = inInbox.slice(0, -1); // conversationOf is oldest first
      if (!older.length) {
        push('Nothing to clean up in this conversation');
        return;
      }
      moveMany(older.map((e) => e.id), 'trash');
    },
    [emails, moveMany, push],
  );

  const cleanForOutput = useCallback((html: string) => processMail(html, { allowImages: false }).html, []);
  const printActive = useCallback(() => activeEmail && printEmail(activeEmail, cleanForOutput), [activeEmail, cleanForOutput]);
  const saveActive = useCallback(() => {
    if (!activeEmail) return;
    downloadText(fileNameFor(activeEmail, 'eml'), toEml(activeEmail, cleanForOutput), 'message/rfc822');
    push('Saved the message as a file. Attachments are not included');
  }, [activeEmail, cleanForOutput, push]);

  const togglePin = useCallback((id: string) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        dbUpdateEmail(id, { pinned: !e.pinned }).catch(() => {});
        return { ...e, pinned: !e.pinned };
      }),
    );
  }, []);

  const snoozeEmail = useCallback(
    (id: string, opt: SnoozeOption) => {
      const email = emails.find((e) => e.id === id);
      if (!email) return;
      const label = SNOOZE_LABELS[opt];
      setEmails((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, folder: 'snoozed', snoozedUntil: label } : e,
        ),
      );
      dbUpdateEmail(id, { folder: 'snoozed', snoozedUntil: label }).catch(() => {});
      push(`Snoozed until ${label}`, 'Undo', () => {
        setEmails((prev) =>
          prev.map((e) => (e.id === id ? { ...email, folder: 'inbox', snoozedUntil: undefined } : e)),
        );
        dbUpdateEmail(id, { folder: 'inbox', snoozedUntil: null }).catch(() => {});
      });
      if (activeId === id) advanceSelection(id, 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emails, activeId, push],
  );

  // ---- Mail bulk ----
  const allSelected = visibleEmails.length > 0 && visibleEmails.every((e) => selectedIds.has(e.id));

  const selectAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(visibleEmails.map((e) => e.id)));
  }, [allSelected, visibleEmails]);

  const bulkMarkRead = useCallback(() => {
    const ids = Array.from(selectedIds);
    setEmails((prev) => prev.map((e) => (selectedIds.has(e.id) ? { ...e, read: true } : e)));
    updateEmailsBulk(ids, { read: true }).catch(() => {});
    push(`Marked ${selectedIds.size} as read`);
    setSelectedIds(new Set());
  }, [selectedIds, push]);

  const bulkArchive = useCallback(() => {
    const ids = new Set(selectedIds);
    const idList = Array.from(ids);
    setEmails((prev) => prev.map((e) => (ids.has(e.id) ? { ...e, folder: 'archive' } : e)));
    updateEmailsBulk(idList, { folder: 'archive' }).catch(() => {});
    push(`Archived ${ids.size} emails`, 'Undo', () => {
      setEmails((prev) => prev.map((e) => (ids.has(e.id) ? { ...e, folder: 'inbox' } : e)));
      updateEmailsBulk(idList, { folder: 'inbox' }).catch(() => {});
    });
    setSelectedIds(new Set());
  }, [selectedIds, push]);

  const bulkDelete = useCallback(() => {
    const ids = new Set(selectedIds);
    const idList = Array.from(ids);
    setEmails((prev) => prev.map((e) => (ids.has(e.id) ? { ...e, folder: 'trash' } : e)));
    updateEmailsBulk(idList, { folder: 'trash' }).catch(() => {});
    push(`Moved ${ids.size} to Deleted Items`, 'Undo', () => {
      setEmails((prev) => prev.map((e) => (ids.has(e.id) ? { ...e, folder: 'inbox' } : e)));
      updateEmailsBulk(idList, { folder: 'inbox' }).catch(() => {});
    });
    setSelectedIds(new Set());
  }, [selectedIds, push]);

  // ---- Contacts CRUD ----
  const openContact = useCallback((id: string) => setActiveContactId(id), []);

  const toggleContactSelect = useCallback((id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleContactStar = useCallback((id: string) => {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const starred = !c.starred;
        dbUpdateContact(id, { starred }).catch(() => {});
        return { ...c, starred };
      }),
    );
  }, []);

  const saveContact = useCallback(
    (draft: Omit<Contact, 'id' | 'createdAt'> & { id?: string }) => {
      if (draft.id) {
        setContacts((prev) => prev.map((c) => (c.id === draft.id ? { ...c, ...draft } : c)));
        dbUpdateContact(draft.id, draft).catch(() => push('Failed to save contact'));
        push('Contact updated');
      } else {
        insertContact(userId, draft)
          .then((newContact) => {
            setContacts((prev) => [newContact, ...prev]);
            push('Contact created');
          })
          .catch(() => push('Failed to create contact'));
      }
    },
    [push, userId],
  );

  const deleteContact = useCallback(
    (id: string) => {
      const c = contacts.find((x) => x.id === id);
      if (!c) return;
      setContacts((prev) => prev.filter((x) => x.id !== id));
      deleteContactRow(id).catch(() => {});
      if (activeContactId === id) setActiveContactId(null);
      push(`Deleted ${contactName(c)}`, 'Undo', () => {
        restoreContact(userId, c)
          .then((restored) => setContacts((prev) => [restored, ...prev]))
          .catch(() => push('Failed to restore contact'));
      });
    },
    [contacts, activeContactId, push, userId],
  );

  const bulkDeleteContacts = useCallback(() => {
    const ids = new Set(selectedContactIds);
    const idList = Array.from(ids);
    const removed = contacts.filter((c) => ids.has(c.id));
    setContacts((prev) => prev.filter((c) => !ids.has(c.id)));
    deleteContactsBulk(idList).catch(() => {});
    push(`Deleted ${ids.size} contacts`, 'Undo', () => {
      Promise.all(removed.map((c) => restoreContact(userId, c)))
        .then((restored) => setContacts((prev) => [...restored, ...prev]))
        .catch(() => push('Failed to restore contacts'));
    });
    setSelectedContactIds(new Set());
  }, [selectedContactIds, contacts, push, userId]);

  const bulkExportContacts = useCallback(() => {
    push(`Exported ${selectedContactIds.size} contacts`);
    setSelectedContactIds(new Set());
  }, [selectedContactIds, push]);

  const bulkMergeContacts = useCallback(() => {
    push(`Merge is a demo action (${selectedContactIds.size} selected)`);
    setSelectedContactIds(new Set());
  }, [selectedContactIds, push]);

  const selectAllContacts = useCallback(() => {
    if (allContactsSelected) setSelectedContactIds(new Set());
    else setSelectedContactIds(new Set(visibleContacts.map((c) => c.id)));
  }, [allContactsSelected, visibleContacts]);

  // ---- Add sender to contacts ----
  const addSenderToContacts = useCallback(
    (email: Email) => {
      if (contacts.some((c) => c.email.toLowerCase() === email.senderEmail.toLowerCase())) return;
      const [first, ...rest] = email.sender.split(' ');
      const last = rest.join(' ');
      insertContact(userId, {
        firstName: first,
        lastName: last,
        email: email.senderEmail,
        phone: '',
        jobTitle: '',
        company: '',
        avatarColor: email.avatarColor,
        notes: `Added from email: “${email.subject}”`,
        groups: [],
        starred: false,
        frequent: false,
      })
        .then((newContact) => {
          setContacts((prev) => [newContact, ...prev]);
          push(`Added ${email.sender} to contacts`);
        })
        .catch(() => push('Failed to add contact'));
    },
    [contacts, push, userId],
  );

  // ---- Calendar ----
  const [newEventEnd, setNewEventEnd] = useState<string | undefined>(undefined);
  const [newEventAllDay, setNewEventAllDay] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState<string | undefined>(undefined);
  const [newEventNotes, setNewEventNotes] = useState<string | undefined>(undefined);
  const [editingOccurrence, setEditingOccurrence] = useState<Date | null>(null);

  const openNewEvent = useCallback(
    (dateISO: string, endISO?: string, allDay?: boolean, title?: string, notes?: string) => {
      setEditingEvent(null);
      setEditingOccurrence(null);
      setNewEventStart(dateISO);
      setNewEventEnd(endISO);
      setNewEventAllDay(!!allDay);
      setNewEventTitle(title);
      setNewEventNotes(notes);
      setEventFormOpen(true);
    },
    [],
  );

  const openEditEvent = useCallback((event: CalendarEvent, occurrenceStart?: Date) => {
    setEditingEvent(event);
    setEditingOccurrence(occurrenceStart ?? null);
    setNewEventStart(undefined);
    setEventFormOpen(true);
  }, []);

  const saveEvent = useCallback(
    (draft: Omit<CalendarEvent, 'id'> & { id?: string }) => {
      const { id, ...rest } = draft;
      if (id) {
        setEvents((prev) => prev.map((ev) => (ev.id === id ? { id, ...rest } : ev)));
        updateEventDb(id, rest).catch(() => push('Failed to save event'));
        push('Event updated');
      } else {
        insertEventDb(userId, rest)
          .then((newEvent) => {
            setEvents((prev) => [...prev, newEvent]);
            push('Event created');
          })
          .catch(() => push('Failed to create event'));
      }
    },
    [push, userId],
  );

  const deleteEvent = useCallback(
    (id: string, scope: 'one' | 'all' = 'all') => {
      const ev = events.find((x) => x.id === id);
      if (ev && scope === 'one' && ev.repeat && editingOccurrence) {
        const next = { ...ev, exdates: [...(ev.exdates ?? []), dateKey(editingOccurrence)] };
        setEvents((prev) => prev.map((x) => (x.id === id ? next : x)));
        const { id: _id, ...rest } = next;
        updateEventDb(id, rest).catch(() => push('Failed to save event'));
        push('Event deleted');
        return;
      }
      setEvents((prev) => prev.filter((x) => x.id !== id));
      deleteEventRow(id).catch(() => {});
      push('Event deleted');
    },
    [events, editingOccurrence, push],
  );

  /** Moves one showing: a single event just moves; a repeating one gets that day skipped and a separate copy made. */
  const moveOccurrence = useCallback(
    (occ: { event: CalendarEvent; start: Date }, target: Date) => {
      const ev = occ.event;
      const duration = new Date(ev.end).getTime() - new Date(ev.start).getTime();
      const keepClock = (t: Date) => (ev.allDay ? new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0) : t);
      const newStart = keepClock(target);
      const newEnd = new Date(newStart.getTime() + duration);
      if (!ev.repeat) {
        const next = { ...ev, start: newStart.toISOString(), end: newEnd.toISOString() };
        setEvents((prev) => prev.map((x) => (x.id === ev.id ? next : x)));
        const { id: _id, ...rest } = next;
        updateEventDb(ev.id, rest).catch(() => push('Failed to move event'));
        return;
      }
      const skipped = { ...ev, exdates: [...(ev.exdates ?? []), dateKey(occ.start)] };
      setEvents((prev) => prev.map((x) => (x.id === ev.id ? skipped : x)));
      const { id: _a, ...skippedRest } = skipped;
      updateEventDb(ev.id, skippedRest).catch(() => push('Failed to move event'));
      const { id: _b, repeat: _r, exdates: _x, ...single } = ev;
      insertEventDb(userId, { ...single, start: newStart.toISOString(), end: newEnd.toISOString() })
        .then((created) => setEvents((prev) => [...prev, created]))
        .catch(() => push('Failed to move event'));
      push('Moved this event only');
    },
    [push, userId],
  );

  /** A task dropped on the calendar becomes an hour of time set aside for it. */
  const taskToCalendar = useCallback(
    (task: Task, start: Date) => {
      const end = new Date(start.getTime() + 3600000);
      insertEventDb(userId, { title: task.title, description: task.notes, location: '', allDay: false, start: start.toISOString(), end: end.toISOString(), color: EVENT_COLORS[0] })
        .then((created) => {
          setEvents((prev) => [...prev, created]);
          push(`Blocked out time for “${task.title}”`);
        })
        .catch(() => push('Failed to add to calendar'));
    },
    [push, userId],
  );

  const mailToCalendar = useCallback(
    (emailId: string, start: Date) => {
      const mail = emails.find((m) => m.id === emailId);
      if (!mail) return;
      openNewEvent(start.toISOString(), new Date(start.getTime() + 3600000).toISOString(), false, mail.subject || '(No subject)', `From ${mail.sender} <${mail.senderEmail}>`);
    },
    [emails, openNewEvent],
  );

  const toggleTaskDone = useCallback(
    (t: Task) => updateTaskItemRef.current(t.done ? { ...t, done: false, completedAt: null } : { ...t, done: true, completedAt: new Date().toISOString() }),
    [],
  );

  // ---- Reminders: shown while the app is open ----
  const firedReminders = useRef<Set<string>>(new Set());
  const eventsRef = useRef<CalendarEvent[]>([]);
  eventsRef.current = events;
  useEffect(() => {
    const tick = () => {
      for (const r of dueReminders(eventsRef.current, new Date(), firedReminders.current)) {
        firedReminders.current.add(r.key);
        const when = r.minutes === 0 ? 'now' : `in ${REMINDER_CHOICES.find((c) => c.minutes === r.minutes)?.label.replace(' before', '') ?? `${r.minutes} minutes`}`;
        const title = r.occurrence.event.title || '(No title)';
        push(`${title} starts ${when} (${shortTime(r.occurrence.start)})`, undefined, undefined, 12000);
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: `Starts ${when}` });
        } catch {
          /* notifications are optional */
        }
      }
    };
    tick();
    const t = window.setInterval(tick, 20000);
    return () => window.clearInterval(t);
  }, [push, events]);
  useEffect(() => {
    try {
      if ('Notification' in window && Notification.permission === 'default' && events.some((e) => e.reminders?.length)) void Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }, [events]);

  // ---- Composer ----
  // ---- Drafts: saved encrypted as you type, one row per draft ----
  const draftIdRef = useRef<string | null>(null);
  const draftQueue = useRef<Promise<void>>(Promise.resolve());
  const [composerSession, setComposerSession] = useState(0);
  const [composerPrefillBody, setComposerPrefillBody] = useState<string | undefined>(undefined);
  const [composerPrefillAttachments, setComposerPrefillAttachments] = useState<PayloadAttachment[] | undefined>(undefined);

  /** Starts a fresh compose session with exactly these fields; anything unset starts empty. */
  const startCompose = useCallback(
    (f: {
      to?: Recipient[];
      cc?: Recipient[];
      bcc?: Recipient[];
      importance?: Importance;
      subject?: string;
      body?: string;
      attachments?: PayloadAttachment[];
    }) => {
      setComposerPrefillTo(f.to);
      setComposerPrefillCc(f.cc);
      setComposerPrefillBcc(f.bcc);
      setComposerPrefillImportance(f.importance);
      setComposerPrefillSubject(f.subject);
      setComposerPrefillBody(f.body);
      setComposerPrefillAttachments(f.attachments);
      setComposerSession((n) => n + 1);
      setComposerState('open');
    },
    [],
  );

  const openComposer = useCallback(() => {
    draftIdRef.current = null;
    startCompose({});
  }, [startCompose]);

  const openComposerForContact = useCallback(
    (c: Contact) => {
      setView('mail');
      draftIdRef.current = null;
      startCompose({ to: [{ id: c.id, name: contactName(c), email: c.email, color: c.avatarColor }] });
    },
    [startCompose],
  );

  const toRecipient = useCallback(
    (address: string): Recipient => {
      const c = contacts.find((x) => x.email.toLowerCase() === address.toLowerCase());
      return c
        ? { id: c.id, name: contactName(c), email: c.email, color: c.avatarColor }
        : { id: address, name: address, email: address, color: '#94a3b8' };
    },
    [contacts],
  );

  const openComposerReply = useCallback(
    (email: Email, mode: ReplyMode = 'reply') => {
      const draft = buildReply(email, mode, myAddress ?? userEmail, (html) => processMail(html, { allowImages: false }).html);
      draftIdRef.current = null;
      startCompose({
        to: draft.to.map(toRecipient),
        cc: draft.cc.map(toRecipient),
        subject: draft.subject,
        body: draft.body,
        attachments: draft.keepAttachments
          ? email.attachments.map((a) => ({ name: a.name, size: a.size, kind: a.kind, file: a.file }))
          : undefined,
      });
    },
    [myAddress, userEmail, startCompose, toRecipient],
  );

  const closeComposer = useCallback(() => setComposerState('closed'), []);
  const minimizeComposer = useCallback(() => setComposerState('minimized'), []);
  const maximizeComposer = useCallback(
    () => setComposerState((s) => (s === 'fullscreen' ? 'open' : 'fullscreen')),
    [],
  );
  const restoreComposer = useCallback(() => setComposerState('open'), []);

  const autosaveDraft = useCallback(
    (d: ComposeData) => {
      // Saves run one after another so a quick second save updates the first draft instead of
      // creating another.
      draftQueue.current = draftQueue.current.then(async () => {
        try {
          const saved = await saveDraft(userId, draftIdRef.current, {
            to: d.to, cc: d.cc, bcc: d.bcc, importance: d.importance, subject: d.subject, body: d.body, payloadAttachments: d.attachments,
          });
          draftIdRef.current = saved.id;
          setEmails((prev) => (prev.some((e) => e.id === saved.id) ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev]));
        } catch {
          /* the next change tries again */
        }
      });
    },
    [userId],
  );

  /** Removes the saved draft once the message was sent or thrown away. */
  const finishDraft = useCallback((forId?: string) => {
    draftQueue.current = draftQueue.current.then(async () => {
      const id = forId ?? draftIdRef.current;
      if (!forId || draftIdRef.current === forId) draftIdRef.current = null;
      if (!id) return;
      await deleteEmailRow(id).catch(() => {});
      setEmails((prev) => prev.filter((e) => e.id !== id));
    });
  }, []);

  const openDraft = useCallback(
    (email: Email) => {
      if (getPrefs().scheduled[email.id]) {
        setScheduled(email.id, null);
        push('Schedule cancelled while you edit. Schedule it again when you are ready');
      }
      startCompose({
        to: (email.toAddresses ?? []).map(toRecipient),
        cc: (email.ccAddresses ?? []).map(toRecipient),
        bcc: (email.bccAddresses ?? []).map(toRecipient),
        importance: email.importance,
        subject: email.subject,
        body: email.body,
        attachments: email.attachments.map((a) => ({ name: a.name, size: a.size, kind: a.kind, file: a.file })),
      });
      draftIdRef.current = email.id;
    },
    [startCompose, toRecipient, push],
  );

  /** The actual send: encrypts, delivers and files the Sent copy. */
  const deliver = useCallback(
    async (d: ComposeData, draftId: string | null) => {
      const { to, subject, body, attachments } = d;
      let outcome: Awaited<ReturnType<typeof sendMessage>>;
      try {
        outcome = await sendMessage({
          userId, myAddress: myAddress ?? userEmail, to, cc: d.cc, bcc: d.bcc, importance: d.importance, subject, body, attachments,
        });
      } catch {
        push('Failed to save sent email. Your message is still in Drafts');
        return;
      }
      if (draftId) finishDraft(draftId);
      const { saved, failed } = outcome;
      setEmails((prev) => [saved, ...prev]);

      if (failed.length === 0) {
        push(`Sent to ${to}`, 'View', () => {
          setView('mail');
          setActiveFolder('sent');
          setActiveLabel(null);
          setActiveId(saved.id);
        });
      } else {
        const list = failed.map((f) => `${f.address} (${f.reason})`).join('; ');
        push(`Saved to Sent Items, but not delivered to ${list}`);
      }
    },
    [push, userId, userEmail, myAddress, finishDraft],
  );

  /** Holds the message for the undo-send delay, then delivers it. */
  const sendEmail = useCallback(
    async (d: ComposeData) => {
      await draftQueue.current; // let a pending autosave finish so the draft id is final
      const draftId = draftIdRef.current;
      draftIdRef.current = null;
      setComposerState('closed');
      const secs = getPrefs().undoSendSeconds;
      if (secs <= 0) {
        void deliver(d, draftId);
        return;
      }
      const timer = window.setTimeout(() => void deliver(d, draftId), secs * 1000);
      push('Sending…', 'Undo', () => {
        window.clearTimeout(timer);
        startCompose({
          to: splitList(d.to).map(toRecipient),
          cc: splitList(d.cc).map(toRecipient),
          bcc: splitList(d.bcc).map(toRecipient),
          importance: d.importance,
          subject: d.subject,
          body: d.body,
          attachments: d.attachments,
        });
        draftIdRef.current = draftId;
      }, secs * 1000);
    },
    [deliver, push, startCompose, toRecipient],
  );

  /** Keeps the message in Drafts and records when to send it. Sent from this browser, not the server. */
  const scheduleEmail = useCallback(
    async (d: ComposeData, at: Date) => {
      await draftQueue.current;
      try {
        const saved = await saveDraft(userId, draftIdRef.current, {
          to: d.to, cc: d.cc, bcc: d.bcc, importance: d.importance, subject: d.subject, body: d.body, payloadAttachments: d.attachments,
        });
        draftIdRef.current = null;
        setEmails((prev) => (prev.some((e) => e.id === saved.id) ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev]));
        setScheduled(saved.id, at.toISOString());
        setComposerState('closed');
        push(`Scheduled for ${at.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. It is sent from this browser, so keep Typhoonpost open`);
      } catch {
        push('Could not schedule the message. It is still in Drafts');
      }
    },
    [userId, push],
  );

  // ---- Scheduled messages: due ones are sent from here, while Typhoonpost is open ----
  const emailsRef = useRef<Email[]>([]);
  emailsRef.current = emails;
  const sendingScheduled = useRef(new Set<string>());
  const runScheduled = useCallback(async () => {
    const now = Date.now();
    for (const [id, at] of Object.entries(getPrefs().scheduled)) {
      if (new Date(at).getTime() > now || sendingScheduled.current.has(id)) continue;
      const draft = emailsRef.current.find((e) => e.id === id && e.folder === 'drafts');
      if (!draft) {
        setScheduled(id, null);
        continue;
      }
      sendingScheduled.current.add(id);
      try {
        const out = await sendMessage({
          userId, myAddress: myAddress ?? userEmail, to: (draft.toAddresses ?? []).join(', '), cc: (draft.ccAddresses ?? []).join(', '),
          bcc: (draft.bccAddresses ?? []).join(', '), importance: draft.importance, subject: draft.subject, body: draft.body,
          attachments: draft.attachments.map((a) => ({ name: a.name, size: a.size, kind: a.kind, file: a.file })),
        });
        setScheduled(id, null);
        finishDraft(id);
        setEmails((prev) => [out.saved, ...prev]);
        push(out.failed.length ? `Scheduled message sent, but not delivered to ${out.failed.map((f) => f.address).join(', ')}` : `Scheduled message "${draft.subject}" sent`);
      } catch {
        setScheduled(id, null);
        push(`Could not send the scheduled message "${draft.subject}". It is still in Drafts`);
      } finally {
        sendingScheduled.current.delete(id);
      }
    }
  }, [userId, myAddress, userEmail, finishDraft, push]);
  useEffect(() => {
    if (dataLoading) return;
    void runScheduled();
    const t = window.setInterval(() => void runScheduled(), 15000);
    return () => window.clearInterval(t);
  }, [dataLoading, runScheduled]);

  // ---- Rules, blocked senders and automatic replies: all decided here, on new mail ----
  const applyScreening = useCallback(
    (list: Email[]): Map<string, RulePatch> => {
      const patches = new Map<string, RulePatch>();
      for (const e of list) {
        const p = decide(e, { blocked: prefs.blocked, safe: prefs.safe, rules: prefs.rules });
        if (p) patches.set(e.id, p);
      }
      if (!patches.size) return patches;
      setEmails((prev) =>
        prev.map((e) => {
          const p = patches.get(e.id);
          return p
            ? { ...e, ...(p.folder ? { folder: p.folder as FolderId, snoozedUntil: undefined } : {}), ...(p.read !== undefined ? { read: p.read } : {}),
                ...(p.starred !== undefined ? { starred: p.starred } : {}), ...(p.pinned !== undefined ? { pinned: p.pinned } : {}), ...(p.labels ? { labels: p.labels } : {}) }
            : e;
        }),
      );
      for (const [id, p] of patches) {
        dbUpdateEmail(id, { ...(p.folder ? { folder: p.folder as FolderId } : {}), read: p.read, starred: p.starred, pinned: p.pinned, labels: p.labels }).catch(() => {});
      }
      return patches;
    },
    [prefs.blocked, prefs.safe, prefs.rules],
  );

  const runRulesNow = useCallback(() => applyScreening(emails.filter((e) => e.folder === 'inbox')).size, [applyScreening, emails]);

  const autoReplyTo = useCallback(
    async (list: Email[]) => {
      const ar = getPrefs().autoReply;
      for (const e of list.slice(0, 10)) {
        const last = getPrefs().autoReplied[e.senderEmail.toLowerCase()];
        if (!shouldAutoReply(e, ar, { now: new Date(), myAddress: myAddress ?? userEmail, lastReplied: last })) continue;
        markAutoReplied(e.senderEmail, new Date().toISOString()); // first, so two arrivals never both trigger one
        const keys = await lookupPublicKeys([e.senderEmail.toLowerCase()]).catch(() => new Map());
        if (!keys.size) continue; // only people on Typhoonpost: the outside mail path would expose your message
        const html = `<p>${ar.message.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`;
        try {
          const out = await sendMessage({
            userId, myAddress: myAddress ?? userEmail, to: e.senderEmail, subject: `${ar.subject.trim() || 'Automatic reply'}: ${e.subject}`, body: html,
          });
          setEmails((prev) => [out.saved, ...prev]);
        } catch {
          /* it will not be retried: one missed automatic reply is better than a repeated one */
        }
      }
    },
    [userId, myAddress, userEmail],
  );

  useEffect(() => {
    if (dataLoading) return;
    const at = (e: Email) => new Date(e.createdAt ?? 0).getTime();
    if (!prefs.rulesCheckedAt) {
      // First time: only mail that arrives from now on is sorted. Existing mail is left alone.
      const newest = emails.reduce((m, e) => Math.max(m, at(e)), 0) || Date.now();
      setRulesCheckedAt(new Date(newest).toISOString());
      return;
    }
    const since = new Date(prefs.rulesCheckedAt).getTime();
    const fresh = emails.filter((e) => e.folder === 'inbox' && at(e) > since);
    if (!fresh.length) return;
    setRulesCheckedAt(new Date(Math.max(...fresh.map(at))).toISOString());
    const patches = applyScreening(fresh);
    if (patches.size) push(`Your rules sorted ${patches.size} new message${patches.size === 1 ? '' : 's'}`);
    const stays = fresh.filter((e) => {
      const f = patches.get(e.id)?.folder;
      return f !== 'spam' && f !== 'trash';
    });
    if (getPrefs().autoReply.enabled && stays.length) void autoReplyTo(stays);
  }, [emails, dataLoading, prefs.rulesCheckedAt, applyScreening, autoReplyTo, push]);

  const discardDraft = useCallback(() => {
    finishDraft();
    push('Draft discarded');
  }, [push, finishDraft]);

  const uploadFile = useCallback((file: File) => uploadAttachment(userId, file), [userId]);
  const removeFile = useCallback((id: string) => void removeAttachmentFiles(userId, [id]).catch(() => {}), [userId]);

  const downloadFile = useCallback(
    async (att: Attachment) => {
      try {
        const blob = await downloadAttachment(userId, att);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        push(`Could not download ${att.name}`);
      }
    },
    [userId, push],
  );

  // ---- Tasks ----
  const addTask = useCallback(
    (title: string, opts: { due: string | null; important: boolean }) => {
      insertTask(userId, { title, notes: '', due: opts.due, important: opts.important, done: false, completedAt: null })
        .then((t) => setTasks((prev) => [t, ...prev]))
        .catch(() => push('Failed to add task'));
    },
    [userId, push],
  );

  const updateTaskItem = useCallback(
    (task: Task) => {
      const before = tasks.find((t) => t.id === task.id);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      updateTaskDb(task.id, task).catch(() => push('Failed to save task'));
      if (before && !before.done && task.done && task.repeat) {
        const due = nextDue(task.due, task.repeat);
        insertTask(userId, { title: task.title, notes: task.notes, due, repeat: task.repeat, important: task.important, done: false, completedAt: null })
          .then((t) => {
            setTasks((prev) => [t, ...prev]);
            push(`Next one is due ${new Date(`${due}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);
          })
          .catch(() => push('Failed to create the next task'));
      }
    },
    [tasks, push, userId],
  );
  const updateTaskItemRef = useRef(updateTaskItem);
  updateTaskItemRef.current = updateTaskItem;
  /** Flags a message for follow-up and keeps a matching task in step with it. */
  const setFollowUp = useCallback(
    (id: string, day: string | null) => {
      const email = emails.find((e) => e.id === id);
      if (!email) return;
      const at = day ? followUpTimestamp(day) : null;
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, followUpAt: at ?? undefined } : e)));
      dbUpdateEmail(id, { followUpAt: at }).catch(() => push('Could not save the follow-up'));
      const title = followUpTaskTitle(email.subject);
      const existing = tasks.find((t) => t.title === title && !t.done);
      if (!day) {
        if (existing) updateTaskItem({ ...existing, done: true, completedAt: new Date().toISOString() });
        push('Follow-up cleared');
        return;
      }
      if (existing) updateTaskItem({ ...existing, due: day });
      else addTask(title, { due: day, important: email.importance === 'high' });
      push(`Follow up set for ${new Date(at!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, added to Tasks`);
    },
    [emails, tasks, push, addTask, updateTaskItem],
  );


  const deleteTask = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      setTasks((prev) => prev.filter((x) => x.id !== id));
      deleteTaskRow(id).catch(() => {});
      push('Task deleted', 'Undo', () => {
        insertTask(userId, t)
          .then((restored) => setTasks((prev) => [restored, ...prev]))
          .catch(() => push('Failed to restore task'));
      });
    },
    [tasks, push, userId],
  );

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (typing) return;
      if (composerState !== 'closed' || shortcutsOpen || settingsOpen || contactFormOpen || paletteOpen) return;

      switch (e.key.toLowerCase()) {
        case 'j':
          if (view === 'mail' && activeId) advanceSelection(activeId, 1);
          break;
        case 'k':
          if (view === 'mail' && activeId) advanceSelection(activeId, -1);
          break;
        case 'e':
          if (view === 'mail' && activeId) archiveEmail(activeId);
          break;
        case 'd':
          if (view === 'mail' && activeId) deleteEmail(activeId);
          break;
        case 'c':
          e.preventDefault();
          openComposer();
          break;
        case '?':
          e.preventDefault();
          setShortcutsOpen(true);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    view,
    activeId,
    advanceSelection,
    archiveEmail,
    deleteEmail,
    openComposer,
    composerState,
    shortcutsOpen,
    settingsOpen,
    contactFormOpen,
    paletteOpen,
  ]);

  // ---- Folder / label switching ----
  const handleFolderChange = (f: FolderId) => {
    setView('mail');
    setActiveFolder(f);
    setActiveLabel(null);
    setActiveId(null);
    setFilter('all');
    setQuery('');
    setListCollapsed(false);
  };

  const handleLabelToggle = (l: LabelId) => {
    setView('mail');
    setActiveLabel((prev) => (prev === l ? null : l));
    setActiveId(null);
    setFilter('all');
    setQuery('');
  };

  const handleQuickSnooze = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    snoozeEmail(id, 'tomorrow');
  };

  const handleViewChange = (v: AppView) => {
    setView(v);
    if (v === 'contacts') {
      setActiveContactId(null);
      setSelectedContactIds(new Set());
    }
  };

  const exportData = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      account: { email: userEmail, address: myAddress ?? null },
      signature,
      emails,
      contacts,
      events,
      tasks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `typhoonpost-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    push('Your data was downloaded');
  };

  const paletteCommands: PaletteCommand[] = [
    { id: 'new-mail', group: 'Actions', label: 'New mail', Icon: PenSquare, shortcut: 'C', run: openComposer },
    { id: 'new-event', group: 'Actions', label: 'New calendar event', Icon: CalendarPlus, run: () => { setView('calendar'); openNewEvent(new Date().toISOString()); } },
    { id: 'new-task', group: 'Actions', label: 'New task', Icon: CheckSquare, run: () => handleViewChange('tasks') },
    { id: 'new-contact', group: 'Actions', label: 'New contact', Icon: UserPlus, run: () => { setView('contacts'); setEditingContact(null); setContactFormOpen(true); } },
    ...(['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive', 'snoozed', 'starred'] as const).map((f) => ({
      id: `go-${f}`,
      group: 'Go to folder',
      label: folderName(f),
      Icon: { inbox: Inbox, sent: Send, drafts: FileText, trash: Trash2, spam: ShieldAlert, archive: Archive, snoozed: Clock, starred: Flag }[f],
      run: () => handleFolderChange(f),
    })),
    ...folderTree(prefs).map(({ folder }) => ({
      id: `go-f-${folder.id}`, group: 'Go to folder', label: folder.name, Icon: FolderIcon, keywords: 'my folder',
      run: () => handleFolderChange(`f:${folder.id}`),
    })),
    ...categoryDefs(prefs).map((l) => ({ id: `cat-${l.id}`, group: 'Categories', label: l.name, Icon: Tag, keywords: 'category label', run: () => handleLabelToggle(l.id) })),
    { id: 'view-mail', group: 'Switch app', label: 'Mail', Icon: Mail, run: () => handleViewChange('mail') },
    { id: 'view-calendar', group: 'Switch app', label: 'Calendar', Icon: CalendarDays, run: () => handleViewChange('calendar') },
    { id: 'view-docs', group: 'Switch app', label: 'Docs', Icon: FileText, keywords: 'documents word processor write letter', run: () => handleViewChange('docs') },
    { id: 'new-doc', group: 'Actions', label: 'New document', Icon: FileText, run: () => handleViewChange('docs') },
    { id: 'view-tasks', group: 'Switch app', label: 'Tasks', Icon: CheckSquare, keywords: 'to do todo', run: () => handleViewChange('tasks') },
    { id: 'view-people', group: 'Switch app', label: 'People', Icon: Users, keywords: 'contacts', run: () => handleViewChange('contacts') },
    { id: 'theme', group: 'Preferences', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', Icon: Moon, keywords: 'theme appearance', run: toggle },
    { id: 'settings', group: 'Preferences', label: 'Settings', Icon: SettingsIcon, keywords: 'signature address', run: () => setSettingsOpen(true) },
    { id: 'shortcuts', group: 'Preferences', label: 'Keyboard shortcuts', Icon: Keyboard, shortcut: '?', run: () => setShortcutsOpen(true) },
    { id: 'signout', group: 'Account', label: 'Sign out', Icon: LogOut, run: onSignOut },
  ];

  if (dataLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg text-fg">
        <Logo size={56} className="animate-pulse" />
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening your mailbox…
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg text-fg p-6">
        <div className="max-w-md rounded-xl border border-line bg-bg-subtle p-6 shadow-panel text-sm">
          <p className="font-semibold text-danger mb-2">Couldn't load your mailbox</p>
          <p className="text-fg-muted mb-4">{dataError}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-accent px-3 py-1.5 text-accent-fg text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-fg">
      <TopBar
        searchValue={view === 'docs' ? docQuery : view === 'contacts' ? contactQuery : view === 'tasks' ? taskQuery : view === 'calendar' ? eventQuery : query}
        onSearchChange={view === 'docs' ? setDocQuery : view === 'contacts' ? setContactQuery : view === 'tasks' ? setTaskQuery : view === 'calendar' ? setEventQuery : setQuery}
        searchPlaceholder={
          view === 'docs' ? 'Search documents' : view === 'contacts' ? 'Search people' : view === 'tasks' ? 'Search tasks' : view === 'calendar' ? 'Search events' : 'Search mail'
        }
        searchDisabled={false}
        theme={theme}
        onToggleTheme={toggle}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
        userEmail={userEmail}
      />

      <div className="flex min-h-0 flex-1">
      <AppRail view={view} onViewChange={handleViewChange} unreadCount={counts.inbox} />
      {view !== 'docs' && <Sidebar
        activeFolder={activeFolder}
        onFolderChange={handleFolderChange}
        counts={counts}
        activeLabel={activeLabel}
        onLabelToggle={handleLabelToggle}
        labelCounts={labelCounts}
        onDropMail={moveMany}
        onDropLabel={addLabelMany}
        onFolderDeleted={folderDeleted}
        view={view}
        userEmail={userEmail}
        contactCount={contacts.length}
        eventCount={events.length}
        taskCount={tasks.filter((t) => !t.done).length}
      />}

      <main className="flex min-w-0 flex-1 flex-col">
        {view === 'mail' && (
          <CommandBar
            email={activeEmail}
            selectionCount={selectedIds.size}
            onNewMail={openComposer}
            onDelete={() => (selectedIds.size > 0 ? bulkDelete() : activeId && deleteEmail(activeId))}
            onArchive={() => (selectedIds.size > 0 ? bulkArchive() : activeId && archiveEmail(activeId))}
            onMove={(f) => activeId && moveEmail(activeId, f)}
            onReply={() => activeEmail && openComposerReply(activeEmail, 'reply')}
            onReplyAll={() => activeEmail && openComposerReply(activeEmail, 'replyAll')}
            onForward={() => activeEmail && openComposerReply(activeEmail, 'forward')}
            onToggleRead={() => activeId && toggleRead(activeId)}
            onToggleFlag={() => activeId && toggleStar(activeId)}
            onSnooze={(opt) => activeId && snoozeEmail(activeId, opt)}
            onFollowUp={(day) => activeId && setFollowUp(activeId, day)}
            onOpenMailSettings={() => setMailSettingsOpen(true)}
            onToggleLabel={(label) => activeId && toggleLabel(activeId, label)}
            more={{
              ignored: activeIgnored,
              focus: activeFocus,
              inFocused: activeEmail ? isFocused(activeEmail, prefs.senderFocus) : true,
              onPrint: printActive,
              onSaveAs: saveActive,
              onIgnore: () => activeEmail && toggleIgnore(activeEmail),
              senderBlocked: activeEmail ? listMatches(prefs.blocked, activeEmail.senderEmail) : false,
              senderSafe: activeEmail ? listMatches(prefs.safe, activeEmail.senderEmail) : false,
              onBlock: () => activeEmail && blockSender(activeEmail),
              onSafe: () => activeEmail && markSafe(activeEmail),
              onSweep: (kind) => activeEmail && sweepSender(activeEmail, kind),
              onCleanUp: () => activeEmail && cleanUpConversation(activeEmail),
              onSenderFocus: (choice) => {
                if (!activeEmail) return;
                setSenderFocus(activeEmail.senderEmail, choice);
                push(choice ? `${activeEmail.sender} will always go to ${choice === 'focused' ? 'Focused' : 'Other'}` : 'Back to automatic sorting');
              },
            }}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1">
      {view === 'mail' ? (
        <div className={`flex min-h-0 min-w-0 flex-1 ${prefs.readingPane === 'bottom' ? 'flex-col' : ''}`}>
          {(prefs.readingPane !== 'off' || !readerOpen || !activeEmail) && (
          <div className={prefs.readingPane === 'bottom' ? 'flex h-[42%] min-h-[170px] shrink-0 border-b border-line' : 'flex min-w-0 flex-1'}>
          <EmailList
            emails={visibleEmails}
            activeId={activeId}
            selectedIds={selectedIds}
            filter={filter}
            onFilterChange={setFilter}
            onOpen={openEmail}
            onToggleSelect={toggleSelect}
            onToggleStar={toggleStar}
            onQuickArchive={archiveEmail}
            onQuickDelete={deleteEmail}
            onQuickMarkUnread={markUnread}
            onTogglePin={togglePin}
            onQuickSnooze={handleQuickSnooze}
            folderName={activeLabel ? `Category: ${categoryDefs(prefs).find((d) => d.id === activeLabel)?.name ?? 'Category'}` : folderName(activeFolder, prefs)}
            onClearSelection={() => setSelectedIds(new Set())}
            onSelectAll={selectAll}
            onBulkMarkRead={bulkMarkRead}
            onBulkDelete={bulkDelete}
            onBulkArchive={bulkArchive}
            category={category}
            onCategoryChange={setCategory}
            collapsed={listCollapsed}
            onToggleCollapse={() => setListCollapsed((v) => !v)}
            allSelected={allSelected}
          />
          </div>
          )}

          {(prefs.readingPane !== 'off' || (readerOpen && activeEmail)) && (
          <EmailReader
            email={activeEmail}
            layout={prefs.readingPane === 'right' ? 'side' : 'full'}
            onBack={prefs.readingPane === 'off' ? () => setReaderOpen(false) : undefined}
            thread={conversation}
            onOpenMessage={openEmail}
            onReply={() => activeEmail && openComposerReply(activeEmail)}
            contacts={contacts}
            onAddToContacts={addSenderToContacts}
            onDownloadAttachment={downloadFile}
            onEditDraft={openDraft}
          />
          )}
        </div>
      ) : view === 'docs' ? (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-fg-muted">Opening Docs…</div>}>
          <DocsView userId={userId} query={docQuery} />
        </Suspense>
      ) : view === 'tasks' ? (
        <TasksView tasks={tasks} query={taskQuery} onAdd={addTask} onUpdate={updateTaskItem} onDelete={deleteTask} />
      ) : view === 'calendar' ? (
        <CalendarView
          events={filterBy(events, eventQuery, eventMatches)}
          tasks={tasks}
          onCreate={openNewEvent}
          onOpenEvent={openEditEvent}
          onToggleTask={toggleTaskDone}
          onTaskToCalendar={taskToCalendar}
          onMoveOccurrence={moveOccurrence}
          onMailToCalendar={mailToCalendar}
        />
      ) : (
        <ContactsView
          contacts={visibleContacts}
          activeGroup={activeContactGroup}
          onGroupChange={setActiveContactGroup}
          groupCounts={contactGroupCounts}
          query={contactQuery}
          onQueryChange={setContactQuery}
          activeId={activeContactId}
          onOpen={openContact}
          selectedIds={selectedContactIds}
          onToggleSelect={toggleContactSelect}
          onToggleStar={toggleContactStar}
          onEdit={(c) => {
            setEditingContact(c);
            setContactFormOpen(true);
          }}
          onSendEmail={openComposerForContact}
          onDelete={deleteContact}
          onCreate={() => {
            setEditingContact(null);
            setContactFormOpen(true);
          }}
          onClearSelection={() => setSelectedContactIds(new Set())}
          onSelectAll={selectAllContacts}
          onBulkDelete={bulkDeleteContacts}
          onBulkExport={bulkExportContacts}
          onBulkMerge={bulkMergeContacts}
          allSelected={allContactsSelected}
        />
        )}
        </div>
      </main>
      </div>

      <Composer
        state={composerState}
        onClose={closeComposer}
        onMinimize={minimizeComposer}
        onMaximize={maximizeComposer}
        onRestore={restoreComposer}
        onSend={sendEmail}
        onSchedule={scheduleEmail}
        onDiscard={discardDraft}
        onAutosave={autosaveDraft}
        onUploadFile={uploadFile}
        onRemoveFile={removeFile}
        onError={push}
        prefillTo={composerPrefillTo}
        prefillCc={composerPrefillCc}
        prefillBcc={composerPrefillBcc}
        prefillImportance={composerPrefillImportance}
        prefillSubject={composerPrefillSubject}
        prefillBody={composerPrefillBody}
        prefillAttachments={composerPrefillAttachments}
        sessionId={composerSession}
        signature={signature}
        contacts={contacts}
      />
      <EventForm
        open={eventFormOpen}
        onClose={() => setEventFormOpen(false)}
        onSave={saveEvent}
        onDelete={deleteEvent}
        editing={editingEvent}
        defaultStartISO={newEventStart}
        defaultEndISO={newEventEnd}
        defaultAllDay={newEventAllDay}
        defaultTitle={newEventTitle}
        defaultDescription={newEventNotes}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} />
      <ShortcutGuide open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <MailSettingsDialog open={mailSettingsOpen} onClose={() => setMailSettingsOpen(false)} onRunRules={runRulesNow} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        signature={signature}
        onSignatureChange={setSignature}
        accountEmail={userEmail}
        onSignOut={onSignOut}
        myAddress={myAddress}
        onChangeAddress={changeAddress}
        onExportData={exportData}
        onAccountDeleted={onSignOut}
        onChangePassword={onChangePassword}
      />
      <ContactForm
        open={contactFormOpen}
        onClose={() => setContactFormOpen(false)}
        onSave={saveContact}
        editing={editingContact}
      />
      <ContactDetail
        contact={activeContact}
        onClose={() => setActiveContactId(null)}
        onEdit={() => {
          if (activeContact) {
            setEditingContact(activeContact);
            setContactFormOpen(true);
          }
        }}
        onToggleStar={() => activeContact && toggleContactStar(activeContact.id)}
        onSendEmail={() => activeContact && openComposerForContact(activeContact)}
        recentEmails={contactRecentEmails}
        onOpenEmail={(id) => {
          setView('mail');
          openEmail(id);
        }}
      />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function App() {
  const auth = useAuth();
  const {
    user,
    loading,
    mfaRequired,
    verifyMfa,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    requestPasswordReset,
  } = auth;

  const authScreen = (
    <AuthScreen onSignIn={signInWithPassword} onSignUp={signUpWithPassword} onForgotPassword={requestPasswordReset} />
  );

  if (!isSupabaseConfigured) return authScreen;

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg text-fg">
        <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
      </div>
    );
  }

  if (!user) return authScreen;

  if (mfaRequired) {
    return <MfaScreen onVerify={verifyMfa} onSignOut={signOut} />;
  }

  if (auth.passwordRecovery || auth.keyStatus === 'locked') {
    return (
      <UnlockScreen
        key={auth.passwordRecovery ? 'reset' : 'unlock'}
        initialMode={auth.passwordRecovery ? 'reset' : 'unlock'}
        error={auth.keyError}
        onUnlock={auth.unlock}
        onReset={auth.resetWithRecoveryKey}
        onSignOut={signOut}
      />
    );
  }

  if (auth.recoveryKey) {
    return <RecoveryKeyScreen recoveryKey={auth.recoveryKey} onDone={auth.acknowledgeRecoveryKey} />;
  }

  return (
    <MailApp
      key={user.id}
      userId={user.id}
      userEmail={user.email ?? ''}
      onSignOut={signOut}
      onChangePassword={auth.changePassword}
    />
  );
}
