import { Search, Inbox, X, PanelLeftClose, PanelLeft, CheckSquare, Trash2, Mail, Archive, FolderInput } from 'lucide-react';
import type { Email, FilterTab, Category } from '@/types';
import { EmailListItem } from '@/components/EmailListItem';

interface EmailListProps {
  emails: Email[];
  activeId: string | null;
  selectedIds: Set<string>;
  filter: FilterTab;
  onFilterChange: (f: FilterTab) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onQuickArchive: (id: string) => void;
  onQuickDelete: (id: string) => void;
  onQuickMarkUnread: (id: string) => void;
  onQuickSnooze: (e: React.MouseEvent, id: string) => void;
  folderName: string;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onBulkMarkRead: () => void;
  onBulkDelete: () => void;
  onBulkArchive: () => void;
  category: Category;
  onCategoryChange: (c: Category) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  allSelected: boolean;
}

const filterTabs: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
];

const categoryTabs: { id: Category; label: string }[] = [
  { id: 'primary', label: 'Primary' },
  { id: 'promotions', label: 'Promotions' },
  { id: 'social', label: 'Social' },
];

export function EmailList({
  emails,
  activeId,
  selectedIds,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  onOpen,
  onToggleSelect,
  onToggleStar,
  onQuickArchive,
  onQuickDelete,
  onQuickMarkUnread,
  onQuickSnooze,
  folderName,
  onClearSelection,
  onSelectAll,
  onBulkMarkRead,
  onBulkDelete,
  onBulkArchive,
  category,
  onCategoryChange,
  collapsed,
  onToggleCollapse,
  allSelected,
}: EmailListProps) {
  if (collapsed) {
    return (
      <section className="flex w-12 shrink-0 flex-col items-center border-r border-line bg-bg-subtle py-3">
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          title="Expand list"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </section>
    );
  }

  const showCategories = folderName === 'Inbox';

  return (
    <section className="flex h-full w-full min-w-0 flex-1 flex-col border-r border-line bg-bg-subtle">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <h2 className="text-base font-semibold tracking-tight text-fg">{folderName}</h2>
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium text-fg-subtle">{emails.length} messages</span>
          <button
            onClick={onToggleCollapse}
            className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            title="Collapse list"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search mail"
            className="w-full rounded-lg border border-line bg-bg py-2 pl-9 pr-8 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {query && (
            <button
              onClick={() => onQueryChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {showCategories && (
        <div className="flex items-center gap-1 px-3">
          {categoryTabs.map((t) => {
            const active = category === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onCategoryChange(t.id)}
                className={`relative px-3 py-2 text-xs font-medium transition-colors ${
                  active ? 'text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {t.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-line px-3">
        {filterTabs.map((t) => {
          const active = filter === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onFilterChange(t.id)}
              className={`relative px-3 py-2.5 text-xs font-medium transition-colors ${
                active ? 'text-fg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-1 border-b border-line bg-accent-soft/40 px-3 py-1.5">
          <button
            onClick={onSelectAll}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <div className="mx-1 h-4 w-px bg-line" />
          <BulkBtn onClick={onBulkMarkRead} Icon={Mail} label="Read" />
          <BulkBtn onClick={onBulkArchive} Icon={Archive} label="Archive" />
          <BulkBtn onClick={onBulkDelete} Icon={Trash2} label="Delete" danger />
          <BulkBtn onClick={() => {}} Icon={FolderInput} label="Move" />
          <button
            onClick={onClearSelection}
            className="ml-auto rounded-md px-2 py-1 text-2xs font-medium text-accent hover:bg-bg-muted"
          >
            {selectedIds.size} selected · Clear
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {emails.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
            <Inbox className="h-8 w-8 opacity-40" />
            <p className="text-sm">No messages here</p>
          </div>
        ) : (
          emails.map((email) => (
            <EmailListItem
              key={email.id}
              email={email}
              active={email.id === activeId}
              selected={selectedIds.has(email.id)}
              onOpen={() => onOpen(email.id)}
              onToggleSelect={() => onToggleSelect(email.id)}
              onToggleStar={() => onToggleStar(email.id)}
              onQuickArchive={() => onQuickArchive(email.id)}
              onQuickDelete={() => onQuickDelete(email.id)}
              onQuickMarkUnread={() => onQuickMarkUnread(email.id)}
              onQuickSnooze={(e) => onQuickSnooze(e, email.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function BulkBtn({
  onClick,
  Icon,
  label,
  danger,
}: {
  onClick: () => void;
  Icon: typeof Mail;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium transition-colors ${
        danger
          ? 'text-fg-muted hover:bg-danger/10 hover:text-danger'
          : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
