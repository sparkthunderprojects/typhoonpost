import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  Inbox,
  Flag,
  Send,
  FileText,
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
import type { Email, FolderId, LabelId, FilterTab, Category, AppView, Contact, ContactGroup, CalendarEvent, Task, Attachment } from '@/types';
import { FOLDER_NAMES, LABEL_DEFS, contactName } from '@/types';
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
} from '@/lib/db';
import { contactMatches, emailMatches, eventMatches, filterBy } from '@/lib/search';
import { TasksView } from '@/components/TasksView';
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
import { Composer, type ComposerState } from '@/components/Composer';
import { ShortcutGuide } from '@/components/ShortcutGuide';
import { SettingsModal } from '@/components/SettingsModal';
import { MfaScreen } from '@/components/MfaScreen';
import { ToastContainer } from '@/components/ToastContainer';
import { ContactsView } from '@/components/ContactsView';
import { ContactDetail } from '@/components/ContactDetail';
import { ContactForm } from '@/components/ContactForm';
import type { Recipient } from '@/components/RecipientField';
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signature, setSignatureState] = useState('');

  // ---- Load this account's data from Supabase on mount ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      setDataError(null);
      try {
        await seedAccountIfEmpty(userId);
        const [loadedEmails, loadedContacts, loadedSignature, loadedEvents, loadedTasks] = await Promise.all([
          fetchEmailsForUser(),
          fetchContactsForUser(),
          fetchSignature(userId),
          fetchEventsForUser(),
          fetchTasksForUser(),
        ]);
        if (cancelled) return;
        setEmails(loadedEmails);
        setContacts(loadedContacts);
        setSignatureState(loadedSignature);
        setEvents(loadedEvents);
        setTasks(loadedTasks);
        setActiveId(loadedEmails.find((e) => e.folder === 'inbox')?.id ?? loadedEmails[0]?.id ?? null);
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
      list = list.filter((e) => (category === 'primary' ? e.category === 'primary' : e.category !== 'primary'));
    }
    if (filter === 'unread') list = list.filter((e) => !e.read);
    if (filter === 'starred') list = list.filter((e) => e.starred);
    list = filterBy(list, query, emailMatches);
    return list;
  }, [emails, activeFolder, activeLabel, category, filter, query]);

  const activeEmail = useMemo(
    () => emails.find((e) => e.id === activeId) ?? null,
    [emails, activeId],
  );

  // ---- Mail counts ----
  const counts = useMemo(() => {
    const c: Record<FolderId, number> = {
      inbox: 0,
      starred: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      trash: 0,
      spam: 0,
      snoozed: 0,
    };
    for (const e of emails) {
      if (!e.read) c[e.folder]++;
    }
    c.starred = emails.filter((e) => e.starred).length;
    c.snoozed = emails.filter((e) => e.folder === 'snoozed').length;
    return c;
  }, [emails]);

  const labelCounts = useMemo(() => {
    const c: Record<LabelId, number> = { work: 0, personal: 0, urgent: 0, finance: 0 };
    for (const e of emails) {
      if (!e.read) for (const l of e.labels) c[l]++;
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
      push(`Moved to ${FOLDER_NAMES[folder]}`, 'Undo', () => {
        setEmails((prev) => prev.map((e) => (e.id === id ? { ...email } : e)));
        dbUpdateEmail(id, { folder: email.folder }).catch(() => {});
      });
      if (activeId === id) advanceSelection(id, 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emails, activeId, push],
  );

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
  const openNewEvent = useCallback((dateISO: string) => {
    setEditingEvent(null);
    setNewEventStart(dateISO);
    setEventFormOpen(true);
  }, []);

  const openEditEvent = useCallback((event: CalendarEvent) => {
    setEditingEvent(event);
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
    (id: string) => {
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
      deleteEventRow(id).catch(() => {});
      push('Event deleted');
    },
    [push],
  );

  // ---- Composer ----
  const openComposer = useCallback(() => {
    setComposerPrefillTo(undefined);
    setComposerPrefillSubject(undefined);
    setComposerState('open');
  }, []);

  const openComposerForContact = useCallback((c: Contact) => {
    setView('mail');
    setComposerPrefillTo([{ id: c.id, name: contactName(c), email: c.email, color: c.avatarColor }]);
    setComposerPrefillSubject(undefined);
    setComposerState('open');
  }, []);

  const openComposerReply = useCallback(
    (email: Email) => {
      setComposerPrefillTo([
        { id: email.id, name: email.sender, email: email.senderEmail, color: email.avatarColor },
      ]);
      setComposerPrefillSubject(`Re: ${email.subject}`);
      setComposerState('open');
    },
    [],
  );

  const closeComposer = useCallback(() => setComposerState('closed'), []);
  const minimizeComposer = useCallback(() => setComposerState('minimized'), []);
  const maximizeComposer = useCallback(
    () => setComposerState((s) => (s === 'fullscreen' ? 'open' : 'fullscreen')),
    [],
  );
  const restoreComposer = useCallback(() => setComposerState('open'), []);

  // ---- Drafts: saved encrypted as you type, one row per draft ----
  const draftIdRef = useRef<string | null>(null);
  const draftQueue = useRef<Promise<void>>(Promise.resolve());
  const [composerSession, setComposerSession] = useState(0);
  const [composerPrefillBody, setComposerPrefillBody] = useState<string | undefined>(undefined);
  const [composerPrefillAttachments, setComposerPrefillAttachments] = useState<PayloadAttachment[] | undefined>(undefined);

  const autosaveDraft = useCallback(
    (to: string, subject: string, body: string, attachments: PayloadAttachment[]) => {
      // Saves run one after another so a quick second save updates the first draft instead of
      // creating another.
      draftQueue.current = draftQueue.current.then(async () => {
        try {
          const saved = await saveDraft(userId, draftIdRef.current, { to, subject, body, payloadAttachments: attachments });
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
  const finishDraft = useCallback(() => {
    draftQueue.current = draftQueue.current.then(async () => {
      const id = draftIdRef.current;
      draftIdRef.current = null;
      if (!id) return;
      await deleteEmailRow(id).catch(() => {});
      setEmails((prev) => prev.filter((e) => e.id !== id));
    });
  }, []);

  const openDraft = useCallback((email: Email) => {
    draftIdRef.current = email.id;
    setComposerPrefillTo(
      (email.toAddresses ?? []).map((addr) => ({ id: addr, name: addr, email: addr, color: '#94a3b8' })),
    );
    setComposerPrefillSubject(email.subject);
    setComposerPrefillBody(email.body);
    setComposerPrefillAttachments(
      email.attachments.map((a) => ({ name: a.name, size: a.size, kind: a.kind, file: a.file })),
    );
    setComposerSession((n) => n + 1);
    setComposerState('open');
  }, []);

  const sendEmail = useCallback(
    async (to: string, subject: string, body: string, attachments: PayloadAttachment[]) => {
      let outcome: Awaited<ReturnType<typeof sendMessage>>;
      try {
        outcome = await sendMessage({ userId, myAddress: myAddress ?? userEmail, to, subject, body, attachments });
      } catch {
        push('Failed to save sent email');
        return;
      }
      finishDraft();
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
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      updateTaskDb(task.id, task).catch(() => push('Failed to save task'));
    },
    [push],
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
    ...(['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive', 'snoozed', 'starred'] as FolderId[]).map((f) => ({
      id: `go-${f}`,
      group: 'Go to folder',
      label: FOLDER_NAMES[f],
      Icon: { inbox: Inbox, sent: Send, drafts: FileText, trash: Trash2, spam: ShieldAlert, archive: Archive, snoozed: Clock, starred: Flag }[f],
      run: () => handleFolderChange(f),
    })),
    ...LABEL_DEFS.map((l) => ({ id: `cat-${l.id}`, group: 'Categories', label: l.name, Icon: Tag, keywords: 'category label', run: () => handleLabelToggle(l.id) })),
    { id: 'view-mail', group: 'Switch app', label: 'Mail', Icon: Mail, run: () => handleViewChange('mail') },
    { id: 'view-calendar', group: 'Switch app', label: 'Calendar', Icon: CalendarDays, run: () => handleViewChange('calendar') },
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
        searchValue={view === 'contacts' ? contactQuery : view === 'tasks' ? taskQuery : view === 'calendar' ? eventQuery : query}
        onSearchChange={view === 'contacts' ? setContactQuery : view === 'tasks' ? setTaskQuery : view === 'calendar' ? setEventQuery : setQuery}
        searchPlaceholder={
          view === 'contacts' ? 'Search people' : view === 'tasks' ? 'Search tasks' : view === 'calendar' ? 'Search events' : 'Search mail'
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
      <Sidebar
        activeFolder={activeFolder}
        onFolderChange={handleFolderChange}
        counts={counts}
        activeLabel={activeLabel}
        onLabelToggle={handleLabelToggle}
        labelCounts={labelCounts}
        view={view}
        userEmail={userEmail}
        contactCount={contacts.length}
        eventCount={events.length}
        taskCount={tasks.filter((t) => !t.done).length}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {view === 'mail' && (
          <CommandBar
            email={activeEmail}
            selectionCount={selectedIds.size}
            onNewMail={openComposer}
            onDelete={() => (selectedIds.size > 0 ? bulkDelete() : activeId && deleteEmail(activeId))}
            onArchive={() => (selectedIds.size > 0 ? bulkArchive() : activeId && archiveEmail(activeId))}
            onMove={(f) => activeId && moveEmail(activeId, f)}
            onReply={() => activeEmail && openComposerReply(activeEmail)}
            onReplyAll={() => activeEmail && openComposerReply(activeEmail)}
            onForward={() => activeEmail && openComposerReply(activeEmail)}
            onToggleRead={() => activeId && toggleRead(activeId)}
            onToggleFlag={() => activeId && toggleStar(activeId)}
            onSnooze={(opt) => activeId && snoozeEmail(activeId, opt)}
            onToggleLabel={(label) => activeId && toggleLabel(activeId, label)}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1">
      {view === 'mail' ? (
        <>
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
            onQuickSnooze={handleQuickSnooze}
            folderName={activeLabel ? `Category: ${LABEL_DEFS.find((d) => d.id === activeLabel)?.name ?? activeLabel}` : FOLDER_NAMES[activeFolder]}
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

          <EmailReader
            email={activeEmail}
            onReply={() => activeEmail && openComposerReply(activeEmail)}
            contacts={contacts}
            onAddToContacts={addSenderToContacts}
            onDownloadAttachment={downloadFile}
            onEditDraft={openDraft}
          />
        </>
      ) : view === 'tasks' ? (
        <TasksView tasks={tasks} query={taskQuery} onAdd={addTask} onUpdate={updateTaskItem} onDelete={deleteTask} />
      ) : view === 'calendar' ? (
        <CalendarView events={filterBy(events, eventQuery, eventMatches)} onCreate={openNewEvent} onOpenEvent={openEditEvent} />
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
        onDiscard={discardDraft}
        onAutosave={autosaveDraft}
        onUploadFile={uploadFile}
        onRemoveFile={removeFile}
        onError={push}
        prefillTo={composerPrefillTo}
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
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} />
      <ShortcutGuide open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
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
