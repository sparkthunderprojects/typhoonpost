import { motion } from 'framer-motion';
import { Star, MoreVertical, Mail, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Contact } from '@/types';
import { contactName, contactInitials } from '@/types';
import { Avatar } from '@/components/Avatar';

interface ContactListItemProps {
  contact: Contact;
  active: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleStar: () => void;
  onEdit: () => void;
  onSendEmail: () => void;
  onDelete: () => void;
}

export function ContactListItem({
  contact,
  active,
  selected,
  onOpen,
  onToggleSelect,
  onToggleStar,
  onEdit,
  onSendEmail,
  onDelete,
}: ContactListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      onClick={onOpen}
      className={`group relative flex cursor-pointer items-center gap-3 border-b border-line px-4 py-3 transition-colors ${
        active ? 'bg-accent-soft/60' : 'hover:bg-bg-muted/60'
      }`}
    >
      {active && (
        <motion.span
          layoutId="contact-active"
          className="absolute left-0 top-0 h-full w-[3px] bg-accent"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}

      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggleSelect}
        className="h-3.5 w-3.5 cursor-pointer rounded border-line-strong text-accent opacity-0 transition-opacity group-hover:opacity-100"
        style={{ opacity: selected ? 1 : undefined }}
      />

      <Avatar initials={contactInitials(contact)} color={contact.avatarColor} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg">{contactName(contact)}</span>
          {contact.starred && <Star className="h-3 w-3 shrink-0 fill-warning text-warning" />}
        </div>
        <p className="truncate text-xs text-fg-muted">{contact.email}</p>
      </div>

      <div className="hidden shrink-0 text-right md:block">
        <p className="truncate text-xs font-medium text-fg-muted">{contact.jobTitle}</p>
        <p className="truncate text-2xs text-fg-subtle">{contact.company}</p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar();
        }}
        className="shrink-0 p-1 text-fg-subtle opacity-0 transition-opacity hover:text-warning group-hover:opacity-100"
        aria-label="Star"
      >
        <Star className={`h-4 w-4 ${contact.starred ? 'fill-warning text-warning' : ''}`} />
      </button>

      <div className="relative shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="rounded-md p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-bg-muted hover:text-fg group-hover:opacity-100"
          aria-label="Actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute right-0 top-8 z-50 w-44 overflow-hidden rounded-xl border border-line-strong bg-bg-subtle shadow-pop"
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem Icon={Pencil} label="Edit" onClick={() => { setMenuOpen(false); onEdit(); }} />
              <MenuItem Icon={Mail} label="Send email" onClick={() => { setMenuOpen(false); onSendEmail(); }} />
              <MenuItem Icon={Star} label={contact.starred ? 'Unstar' : 'Star'} onClick={() => { setMenuOpen(false); onToggleStar(); }} />
              <MenuItem Icon={Trash2} label="Delete" danger onClick={() => { setMenuOpen(false); onDelete(); }} />
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  Icon,
  label,
  onClick,
  danger,
}: {
  Icon: typeof Mail;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
        danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-bg-muted'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
