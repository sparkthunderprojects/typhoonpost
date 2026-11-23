import { useState, type ReactNode } from 'react';
import {
  Inbox,
  Flag,
  Send,
  FileText,
  Archive,
  Trash2,
  ShieldAlert,
  Clock,
  Users,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { FolderId, LabelId, AppView } from '@/types';
import { LABEL_DEFS, FOLDER_NAMES } from '@/types';

interface SidebarProps {
  activeFolder: FolderId;
  onFolderChange: (f: FolderId) => void;
  counts: Record<FolderId, number>;
  activeLabel: LabelId | null;
  onLabelToggle: (l: LabelId) => void;
  labelCounts: Record<LabelId, number>;
  view: AppView;
  taskCount: number;
  userEmail: string;
  contactCount: number;
  eventCount: number;
}

const ICONS: Record<FolderId, typeof Inbox> = {
  inbox: Inbox,
  starred: Flag,
  snoozed: Clock,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  trash: Trash2,
  spam: ShieldAlert,
};

const FAVORITES: FolderId[] = ['inbox', 'sent', 'drafts'];
const ACCOUNT_FOLDERS: FolderId[] = ['inbox', 'drafts', 'sent', 'trash', 'spam', 'archive', 'snoozed', 'starred'];
// Folders whose badge shows an unread count; the rest show a plain total only for flagged/snoozed.
const UNREAD_BADGE: FolderId[] = ['inbox', 'drafts', 'spam'];

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[13px] font-semibold text-fg hover:bg-bg-muted"
        aria-expanded={open}
      >
        <Chevron className="h-3.5 w-3.5 text-fg-muted" />
        <span className="truncate">{title}</span>
      </button>
      {open && <ul className="mt-0.5 space-y-px">{children}</ul>}
    </div>
  );
}

export function Sidebar({
  activeFolder,
  onFolderChange,
  counts,
  activeLabel,
  onLabelToggle,
  labelCounts,
  view,
  taskCount,
  userEmail,
  contactCount,
  eventCount,
}: SidebarProps) {
  const folderRow = (id: FolderId) => {
    const active = activeFolder === id && !activeLabel;
    const Icon = ICONS[id];
    const count = counts[id] ?? 0;
    const showBadge = count > 0 && (UNREAD_BADGE.includes(id) || id === 'starred' || id === 'snoozed');
    return (
      <li key={id}>
        <button
          onClick={() => onFolderChange(id)}
          aria-current={active ? 'page' : undefined}
          className={`relative flex w-full items-center gap-2.5 rounded py-1.5 pl-6 pr-2 text-sm transition-colors ${
            active ? 'bg-accent-soft font-semibold text-fg' : 'text-fg hover:bg-bg-muted'
          }`}
        >
          {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r bg-accent" />}
          <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : 'text-fg-muted'}`} />
          <span className="flex-1 truncate text-left">{FOLDER_NAMES[id]}</span>
          {showBadge && (
            <span className={`text-xs ${active || UNREAD_BADGE.includes(id) ? 'font-semibold text-accent' : 'text-fg-subtle'}`}>
              {count}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-bg">
      {view === 'mail' && (
        <>
          <nav className="flex-1 overflow-y-auto px-2 pt-3 scrollbar-thin" aria-label="Folders">
            <Section title="Favorites">{FAVORITES.map(folderRow)}</Section>
            <Section title={userEmail || 'Mailbox'}>{ACCOUNT_FOLDERS.map(folderRow)}</Section>
            <Section title="Categories">
              {LABEL_DEFS.map((l) => {
                const active = activeLabel === l.id;
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => onLabelToggle(l.id)}
                      className={`flex w-full items-center gap-2.5 rounded py-1.5 pl-6 pr-2 text-sm transition-colors ${
                        active ? 'bg-accent-soft font-semibold text-fg' : 'text-fg hover:bg-bg-muted'
                      }`}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: l.color }} />
                      <span className="flex-1 truncate text-left">{l.name}</span>
                      {labelCounts[l.id] > 0 && (
                        <span className="text-xs font-semibold text-accent">{labelCounts[l.id]}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </Section>
          </nav>

        </>
      )}

      {view === 'calendar' && (
        <div className="flex-1 overflow-y-auto px-3 pt-4 scrollbar-thin">
          <div className="mb-2 px-1 text-[13px] font-semibold text-fg">Calendar</div>
          <div className="flex items-center justify-between rounded bg-accent-soft px-3 py-2 text-sm font-medium text-fg">
            <span>My calendar</span>
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-semibold text-accent-fg">{eventCount}</span>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-fg-subtle">
            Click any day to add an event, or click an existing event to edit or delete it.
          </p>
        </div>
      )}

      {view === 'contacts' && (
        <div className="flex-1 overflow-y-auto px-3 pt-4 scrollbar-thin">
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-semibold text-fg">
            <Users className="h-4 w-4 text-fg-muted" /> People
          </div>
          <div className="flex items-center justify-between rounded bg-accent-soft px-3 py-2 text-sm font-medium text-fg">
            <span>All contacts</span>
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-semibold text-accent-fg">{contactCount}</span>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-fg-subtle">
            Add, edit, flag and group the people you email. They appear instantly in the composer's recipient suggestions.
          </p>
        </div>
      )}
      {view === 'tasks' && (
        <div className="flex-1 overflow-y-auto px-3 pt-4 scrollbar-thin">
          <div className="mb-2 px-1 text-[13px] font-semibold text-fg">Tasks</div>
          <div className="flex items-center justify-between rounded bg-accent-soft px-3 py-2 text-sm font-medium text-fg">
            <span>Open tasks</span>
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-semibold text-accent-fg">{taskCount}</span>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-fg-subtle">
            Tasks are encrypted in your browser like your mail. Only you can read them.
          </p>
        </div>
      )}
    </aside>
  );
}
