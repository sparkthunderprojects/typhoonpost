import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Pencil,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Star,
  Tag,
  Clock,
  Inbox,
} from 'lucide-react';
import type { Contact, Email } from '@/types';
import { contactName, contactInitials, CONTACT_GROUP_DEFS } from '@/types';
import { Avatar } from '@/components/Avatar';

interface ContactDetailProps {
  contact: Contact | null;
  onClose: () => void;
  onEdit: () => void;
  onToggleStar: () => void;
  onSendEmail: () => void;
  recentEmails: Email[];
  onOpenEmail: (id: string) => void;
}

export function ContactDetail({
  contact,
  onClose,
  onEdit,
  onToggleStar,
  onSendEmail,
  recentEmails,
  onOpenEmail,
}: ContactDetailProps) {
  return (
    <AnimatePresence>
      {contact && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line-strong bg-bg-subtle shadow-pop"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold text-fg">Contact</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={onToggleStar}
                  className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                  aria-label="Star"
                >
                  <Star className={`h-4 w-4 ${contact.starred ? 'fill-warning text-warning' : ''}`} />
                </button>
                <button
                  onClick={onEdit}
                  className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {/* Profile */}
              <div className="flex flex-col items-center px-6 pb-4 text-center">
                <Avatar initials={contactInitials(contact)} color={contact.avatarColor} size="lg" ring />
                <h2 className="mt-3 text-lg font-semibold tracking-tight text-fg">
                  {contactName(contact)}
                </h2>
                <p className="text-sm text-fg-muted">
                  {contact.jobTitle}
                  {contact.company ? ` · ${contact.company}` : ''}
                </p>
                <button
                  onClick={onSendEmail}
                  className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-soft transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  <Mail className="h-4 w-4" />
                  Send email
                </button>
              </div>

              {/* Info */}
              <div className="space-y-1 px-6 py-4">
                <InfoRow Icon={Mail} label="Email" value={contact.email} />
                <InfoRow Icon={Phone} label="Phone" value={contact.phone} />
                <InfoRow Icon={Briefcase} label="Title" value={contact.jobTitle} />
                <InfoRow Icon={Building2} label="Company" value={contact.company} />
              </div>

              {/* Labels */}
              <div className="px-6 py-3">
                <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                  <Tag className="h-3 w-3" /> Groups
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contact.groups.length === 0 && (
                    <span className="text-xs text-fg-subtle">No groups assigned</span>
                  )}
                  {contact.groups.map((g) => {
                    const def = CONTACT_GROUP_DEFS.find((d) => d.id === g);
                    return (
                      <span
                        key={g}
                        className="rounded-full bg-bg-muted px-2 py-0.5 text-2xs font-medium capitalize text-fg-muted"
                      >
                        {def?.name ?? g}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="px-6 py-3">
                <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                  Notes
                </div>
                <p className="rounded-xl border border-line bg-bg p-3 text-sm leading-relaxed text-fg-muted">
                  {contact.notes || 'No notes yet.'}
                </p>
              </div>

              {/* Recent interactions */}
              <div className="px-6 py-3 pb-8">
                <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                  <Clock className="h-3 w-3" /> Recent email interactions
                </div>
                {recentEmails.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-6 text-fg-subtle">
                    <Inbox className="h-6 w-6 opacity-40" />
                    <p className="text-xs">No recent emails with this contact</p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {recentEmails.map((e) => (
                      <li key={e.id}>
                        <button
                          onClick={() => onOpenEmail(e.id)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-muted"
                        >
                          <Avatar initials={e.initials} color={e.avatarColor} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-fg">{e.subject}</p>
                            <p className="truncate text-2xs text-fg-subtle">
                              {e.date} · {e.timestamp}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof Mail;
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-1.5">
      <Icon className="h-4 w-4 shrink-0 text-fg-subtle" />
      <div className="min-w-0">
        <p className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">{label}</p>
        <p className="truncate text-sm text-fg">{value}</p>
      </div>
    </div>
  );
}
