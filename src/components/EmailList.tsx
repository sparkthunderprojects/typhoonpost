import { useState } from 'react';
import { Inbox, PanelLeftClose, PanelLeft, CheckSquare, Trash2, Mail, Archive, ListFilter, Check } from 'lucide-react';
import type { Email, FilterTab, Category } from '@/types';
import { EmailListItem } from '@/components/EmailListItem';
import { Logo } from '@/components/Logo';
import { startMailDrag } from '@/lib/dnd';

interface EmailListProps {
  emails: Email[];
  activeId: string | null;
  selectedIds: Set<string>;
  filter: FilterTab;
  onFilterChange: (f: FilterTab) => void;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onQuickArchive: (id: string) => void;
  onQuickDelete: (id: string) => void;
  onQuickMarkUnread: (id: string) => void;
  onQuickSnooze: (e: React.MouseEvent, id: string) => void;
  onTogglePin: (id: string) => void;
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

const filterOptions: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Flagged' },
];

// Outlook-style Focused / Other: "Focused" is the primary category, "Other" is everything else.
const focusTabs: { id: Category; label: string }[] = [
  { id: 'primary', label: 'Focused' },
  { id: 'promotions', label: 'Other' },
];

export function EmailList({
  emails,
  activeId,
  selectedIds,
  filter,
  onFilterChange,
  onOpen,
  onToggleSelect,
  onToggleStar,
  onQuickArchive,
  onQuickDelete,
  onQuickMarkUnread,
  onQuickSnooze,
  onTogglePin,
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
  const [filterOpen, setFilterOpen] = useState(false);

  if (collapsed) {
    return (
      <section className="flex w-12 shrink-0 flex-col items-center border-r border-line bg-bg-subtle py-3">
        <button
          onClick={onToggleCollapse}
          className="rounded p-2 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          title="Expand list"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </section>
    );
  }

  const showFocusTabs = folderName === 'Inbox';
  const filterLabel = filterOptions.find((o) => o.id === filter)?.label ?? 'All';

  return (
    <section className="flex h-full w-full min-w-0 flex-1 flex-col border-r border-line bg-bg-subtle">
      <div className="flex h-11 items-center justify-between border-b border-line px-3">
        {showFocusTabs ? (
          <div className="flex items-center gap-1">
            {focusTabs.map((t) => {
              const active = (t.id === 'primary') === (category === 'primary');
              return (
                <button
                  key={t.id}
                  onClick={() => onCategoryChange(t.id)}
                  className={`relative px-3 py-2.5 text-sm transition-colors ${
                    active ? 'font-semibold text-fg' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {t.label}
                  {active && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-t bg-accent" />}
                </button>
              );
            })}
          </div>
        ) : (
          <h2 className="truncate px-1 text-sm font-semibold text-fg">{folderName}</h2>
        )}

        <div className="relative flex items-center gap-1">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[13px] text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            aria-haspopup="menu"
            aria-expanded={filterOpen}
          >
            <ListFilter className="h-4 w-4" />
            {filter === 'all' ? 'Filter' : filterLabel}
          </button>
          {filterOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
              <div className="absolute right-8 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-line-strong bg-bg-subtle py-1 shadow-pop">
                {filterOptions.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      onFilterChange(o.id);
                      setFilterOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-fg hover:bg-bg-muted"
                  >
                    {o.label}
                    {filter === o.id && <Check className="h-4 w-4 text-accent" />}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            onClick={onToggleCollapse}
            className="rounded p-1.5 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            title="Collapse list"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
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
          <EmptyState folderName={folderName} filtered={filter !== 'all'} />
        ) : (
          groupByDate(emails).map((group) => (
            <div key={group.label}>
              <div className="sticky top-0 z-10 border-b border-line bg-bg-subtle/95 px-4 py-1.5 text-xs font-semibold text-fg-muted backdrop-blur">
                {group.label}
              </div>
              {group.items.map((email) => (
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
                  onTogglePin={() => onTogglePin(email.id)}
                  onDragStart={(e) => startMailDrag(e, selectedIds.has(email.id) ? [...selectedIds] : [email.id])}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function groupByDate(emails: Email[]): { label: string; items: Email[] }[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 24 * 3600 * 1000;
  const order = ['Today', 'Yesterday', 'This week', 'Last week', 'Earlier'];
  const buckets = new Map<string, Email[]>();
  for (const e of emails) {
    const t = e.createdAt ? new Date(e.createdAt).getTime() : Date.now();
    const age = startOfToday.getTime() - t;
    const label =
      age <= 0 ? 'Today' : age <= day ? 'Yesterday' : age <= 6 * day ? 'This week' : age <= 13 * day ? 'Last week' : 'Earlier';
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(e);
  }
  return order.filter((l) => buckets.has(l)).map((label) => ({ label, items: buckets.get(label)! }));
}

function EmptyState({ folderName, filtered }: { folderName: string; filtered: boolean }) {
  const inbox = folderName === 'Inbox';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        {inbox && !filtered ? <Logo size={34} tile={false} /> : <Inbox className="h-7 w-7" />}
      </div>
      <p className="text-base font-semibold text-fg">
        {filtered ? 'Nothing matches this filter' : inbox ? "You're all caught up" : 'Nothing here yet'}
      </p>
      <p className="max-w-[240px] text-sm text-fg-muted">
        {filtered
          ? 'Clear the filter to see everything in this folder.'
          : inbox
            ? 'New messages will appear here the moment they arrive.'
            : `Messages you move to ${folderName} will show up here.`}
      </p>
    </div>
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
