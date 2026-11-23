import { Search, UserPlus, X, Inbox, GitMerge, Download, Trash2, CheckSquare } from 'lucide-react';
import type { Contact, ContactGroup } from '@/types';
import { CONTACT_GROUP_DEFS } from '@/types';
import { ContactListItem } from '@/components/ContactListItem';

interface ContactsViewProps {
  contacts: Contact[];
  activeGroup: ContactGroup;
  onGroupChange: (g: ContactGroup) => void;
  groupCounts: Record<ContactGroup, number>;
  query: string;
  onQueryChange: (q: string) => void;
  activeId: string | null;
  onOpen: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onEdit: (c: Contact) => void;
  onSendEmail: (c: Contact) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onBulkDelete: () => void;
  onBulkExport: () => void;
  onBulkMerge: () => void;
  allSelected: boolean;
}

const groupIcons: Record<ContactGroup, typeof Inbox> = {
  all: Inbox,
  frequent: UserPlus,
  starred: CheckSquare,
  work: Inbox,
  family: Inbox,
  vendors: Inbox,
};

export function ContactsView({
  contacts,
  activeGroup,
  onGroupChange,
  groupCounts,
  query,
  onQueryChange,
  activeId,
  onOpen,
  selectedIds,
  onToggleSelect,
  onToggleStar,
  onEdit,
  onSendEmail,
  onDelete,
  onCreate,
  onClearSelection,
  onSelectAll,
  onBulkDelete,
  onBulkExport,
  onBulkMerge,
  allSelected,
}: ContactsViewProps) {
  return (
    <section className="flex h-full w-full min-w-0 flex-1 bg-bg-subtle">
      {/* Category nav */}
      <div className="flex w-52 shrink-0 flex-col border-r border-line bg-bg-subtle">
        <div className="px-4 py-4">
          <button
            onClick={onCreate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-soft transition-all hover:brightness-105 active:scale-[0.98]"
          >
            <UserPlus className="h-4 w-4" />
            Create Contact
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 scrollbar-thin">
          <ul className="space-y-0.5">
            {CONTACT_GROUP_DEFS.map((g) => {
              const active = activeGroup === g.id;
              const Icon = groupIcons[g.id] ?? Inbox;
              const count = groupCounts[g.id] ?? 0;
              return (
                <li key={g.id}>
                  <button
                    onClick={() => onGroupChange(g.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-accent-soft font-medium text-fg'
                        : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-accent' : ''}`} />
                    <span className="flex-1 text-left">{g.name}</span>
                    {count > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
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
        </nav>
      </div>

      {/* Main list */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-base font-semibold tracking-tight text-fg">
            {CONTACT_GROUP_DEFS.find((g) => g.id === activeGroup)?.name ?? 'Contacts'}
          </h2>
          <span className="text-2xs font-medium text-fg-subtle">{contacts.length} people</span>
        </div>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search contacts"
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

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-1 border-y border-line bg-accent-soft/40 px-3 py-1.5">
            <button
              onClick={onSelectAll}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <div className="mx-1 h-4 w-px bg-line" />
            <BulkBtn onClick={onBulkMerge} Icon={GitMerge} label="Merge" />
            <BulkBtn onClick={onBulkExport} Icon={Download} label="Export" />
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
          {contacts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
              <Inbox className="h-8 w-8 opacity-40" />
              <p className="text-sm">No contacts found</p>
            </div>
          ) : (
            contacts.map((c) => (
              <ContactListItem
                key={c.id}
                contact={c}
                active={c.id === activeId}
                selected={selectedIds.has(c.id)}
                onOpen={() => onOpen(c.id)}
                onToggleSelect={() => onToggleSelect(c.id)}
                onToggleStar={() => onToggleStar(c.id)}
                onEdit={() => onEdit(c)}
                onSendEmail={() => onSendEmail(c)}
                onDelete={() => onDelete(c.id)}
              />
            ))
          )}
        </div>
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
  Icon: typeof Trash2;
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
