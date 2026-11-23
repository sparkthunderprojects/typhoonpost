import { motion } from 'framer-motion';
import {
  Inbox,
  Star,
  Send,
  FileText,
  Archive,
  Trash2,
  ShieldAlert,
  Pencil,
  Tag,
  Moon,
  Sun,
  Mail,
  Clock,
  Settings,
  Users,
  Radio,
  RefreshCw,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';
import type { FolderId, LabelId, AppView } from '@/types';
import { LABEL_DEFS } from '@/types';

interface SidebarProps {
  activeFolder: FolderId;
  onFolderChange: (f: FolderId) => void;
  counts: Record<FolderId, number>;
  activeLabel: LabelId | null;
  onLabelToggle: (l: LabelId) => void;
  labelCounts: Record<LabelId, number>;
  onCompose: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  view: AppView;
  onViewChange: (v: AppView) => void;
  contactCount: number;
  eventCount: number;
  liveMode: boolean;
  onToggleLive: () => void;
  liveLoading: boolean;
  onRefreshLive: () => void;
  liveError: string | null;
}

const folders: { id: FolderId; name: string; icon: typeof Inbox }[] = [
  { id: 'inbox', name: 'Inbox', icon: Inbox },
  { id: 'starred', name: 'Starred', icon: Star },
  { id: 'snoozed', name: 'Snoozed', icon: Clock },
  { id: 'sent', name: 'Sent', icon: Send },
  { id: 'drafts', name: 'Drafts', icon: FileText },
  { id: 'archive', name: 'Archive', icon: Archive },
  { id: 'trash', name: 'Trash', icon: Trash2 },
  { id: 'spam', name: 'Spam', icon: ShieldAlert },
];

export function Sidebar({
  activeFolder,
  onFolderChange,
  counts,
  activeLabel,
  onLabelToggle,
  labelCounts,
  onCompose,
  theme,
  onToggleTheme,
  onOpenSettings,
  view,
  onViewChange,
  contactCount,
  eventCount,
  liveMode,
  onToggleLive,
  liveLoading,
  onRefreshLive,
  liveError,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-bg-subtle">
      <div className="flex items-center gap-2 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <Mail className="h-4 w-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-fg">Veloce Mail</span>
      </div>

      {/* View switcher */}
      <div className="mx-3 mb-2 grid grid-cols-3 gap-1 rounded-xl bg-bg-muted p-1">
        <button
          onClick={() => onViewChange('mail')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            view === 'mail'
              ? 'bg-bg-subtle text-fg shadow-soft'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          <Mail className="h-3.5 w-3.5" />
          Mail
        </button>
        <button
          onClick={() => onViewChange('calendar')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            view === 'calendar'
              ? 'bg-bg-subtle text-fg shadow-soft'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Calendar
        </button>
        <button
          onClick={() => onViewChange('contacts')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            view === 'contacts'
              ? 'bg-bg-subtle text-fg shadow-soft'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Contacts
        </button>
      </div>

      {view === 'mail' && (
        <>
          <div className="px-3">
            <button
              onClick={onCompose}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-soft transition-all hover:brightness-105 active:scale-[0.98]"
            >
              <Pencil className="h-4 w-4" />
              Compose
              <kbd className="ml-1 hidden rounded bg-accent-fg/15 px-1.5 py-0.5 text-2xs font-medium text-accent-fg/80 sm:inline-block">
                C
              </kbd>
            </button>
          </div>

          {/* Live Mail (Mailpit) toggle */}
          <div className="mx-3 mt-2 mb-1">
            <button
              onClick={onToggleLive}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                liveMode
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-fg-muted hover:bg-bg-muted hover:text-fg'
              }`}
            >
              <Radio className={`h-3.5 w-3.5 ${liveMode ? 'text-accent' : ''}`} />
              <span className="flex-1 text-left">Live Mail (Mailpit)</span>
              {liveMode && (
                <span
                  onClick={(e) => { e.stopPropagation(); onRefreshLive(); }}
                  className="rounded p-0.5 hover:bg-bg"
                  title="Refresh"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${liveLoading ? 'animate-spin' : ''}`} />
                </span>
              )}
            </button>
            {liveMode && liveError && (
              <p className="mt-1 flex items-center gap-1 px-1 text-2xs text-danger">
                <AlertCircle className="h-3 w-3" /> {liveError}
              </p>
            )}
          </div>

          <nav className="mt-4 flex-1 overflow-y-auto px-3 scrollbar-thin">
            <ul className="space-y-0.5">
              {folders.map((f) => {
                const active = activeFolder === f.id && !activeLabel;
                const Icon = f.icon;
                const count = counts[f.id] ?? 0;
                const showBadge = (f.id === 'inbox' || f.id === 'drafts' || f.id === 'snoozed') && count > 0;
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => onFolderChange(f.id)}
                      className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? 'font-medium text-fg'
                          : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="folder-active"
                          className="absolute inset-0 rounded-lg bg-accent-soft"
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      )}
                      <Icon className={`relative h-4 w-4 ${active ? 'text-accent' : ''}`} />
                      <span className="relative flex-1 text-left">{f.name}</span>
                      {showBadge && (
                        <span
                          className={`relative rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
                            active ? 'bg-accent text-accent-fg' : 'bg-bg-muted text-fg-muted'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 mb-2 flex items-center justify-between px-3">
              <span className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Labels
              </span>
              <Tag className="h-3 w-3 text-fg-subtle" />
            </div>
            <ul className="space-y-0.5">
              {LABEL_DEFS.map((l) => {
                const active = activeLabel === l.id;
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => onLabelToggle(l.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? 'bg-accent-soft font-medium text-fg'
                          : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: l.color }}
                      />
                      <span className="flex-1 text-left">{l.name}</span>
                      {labelCounts[l.id] > 0 && (
                        <span className="text-2xs font-medium text-fg-subtle">
                          {labelCounts[l.id]}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      )}

      {view === 'calendar' && (
        <div className="flex-1 overflow-y-auto px-3 pt-3 scrollbar-thin">
          <div className="mb-2 px-3 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
            Calendar
          </div>
          <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-fg">
            <span>Upcoming events</span>
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-semibold text-accent-fg">
              {eventCount}
            </span>
          </div>
          <p className="mt-3 px-3 text-xs leading-relaxed text-fg-subtle">
            Click any day to add an event, or click an existing event to edit or delete it.
          </p>
        </div>
      )}

      {view === 'contacts' && (
        <div className="flex-1 overflow-y-auto px-3 pt-3 scrollbar-thin">
          <div className="mb-2 px-3 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
            Contacts
          </div>
          <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-fg">
            <span>All Contacts</span>
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-semibold text-accent-fg">
              {contactCount}
            </span>
          </div>
          <p className="mt-3 px-3 text-xs leading-relaxed text-fg-subtle">
            Manage people you email. Add, edit, star, and label contacts — they show up
            instantly in the composer's recipient autocomplete.
          </p>
        </div>
      )}

      <div className="border-t border-line p-3">
        <button
          onClick={onToggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </aside>
  );
}
