import { AnimatePresence, motion } from 'framer-motion';
import { X, UserPlus, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Contact, ContactGroup } from '@/types';
import { CONTACT_GROUP_DEFS, contactInitials } from '@/types';
import { Avatar } from '@/components/Avatar';

interface ContactFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (c: Omit<Contact, 'id' | 'createdAt'> & { id?: string }) => void;
  editing: Contact | null;
}

const palette = ['#2563eb', '#0EA5E9', '#14B8A6', '#16A34A', '#F59E0B', '#EC4899', '#8B5CF6', '#DC2626'];

const emptyDraft: Omit<Contact, 'id' | 'createdAt'> = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  jobTitle: '',
  company: '',
  avatarColor: palette[0],
  notes: '',
  groups: [],
  starred: false,
  frequent: false,
};

export function ContactForm({ open, onClose, onSave, editing }: ContactFormProps) {
  const [draft, setDraft] = useState<Omit<Contact, 'id' | 'createdAt'>>(emptyDraft);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        const { id: _id, createdAt: _c, ...rest } = editing;
        setDraft(rest);
      } else {
        setDraft(emptyDraft);
      }
      setTimeout(() => firstRef.current?.focus(), 80);
    }
  }, [open, editing]);

  if (!open) return null;

  const toggleGroup = (g: ContactGroup) => {
    setDraft((d) => ({
      ...d,
      groups: d.groups.includes(g)
        ? d.groups.filter((x) => x !== g)
        : [...d.groups, g],
    }));
  };

  const handleSave = () => {
    if (!draft.firstName.trim() && !draft.lastName.trim()) return;
    onSave({ ...draft, id: editing?.id });
    onClose();
  };

  const preview: Contact = { ...draft, id: 'preview', createdAt: '' };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line-strong bg-bg-subtle shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-line bg-bg-muted px-4 py-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-fg">
                {editing ? 'Edit contact' : 'Create contact'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Preview */}
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Avatar initials={contactInitials(preview)} color={draft.avatarColor} size="lg" />
              <div>
                <p className="text-sm font-semibold text-fg">
                  {[draft.firstName, draft.lastName].filter(Boolean).join(' ') || 'New contact'}
                </p>
                <p className="text-xs text-fg-subtle">{draft.email || 'email@example.com'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 px-5 py-4">
              <Field label="First name">
                <input
                  ref={firstRef}
                  value={draft.firstName}
                  onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="Last name">
                <input
                  value={draft.lastName}
                  onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="Email" full>
                <input
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  className="form-input"
                  placeholder="name@example.com"
                />
              </Field>
              <Field label="Phone" full>
                <input
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="Job title">
                <input
                  value={draft.jobTitle}
                  onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="Company">
                <input
                  value={draft.company}
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                  className="form-input"
                />
              </Field>
            </div>

            {/* Avatar color */}
            <div className="px-5 pb-3">
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Avatar color
              </p>
              <div className="flex flex-wrap gap-1.5">
                {palette.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraft({ ...draft, avatarColor: c })}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                  >
                    {draft.avatarColor === c && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Groups */}
            <div className="px-5 pb-3">
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Groups
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CONTACT_GROUP_DEFS.filter((g) => g.id !== 'all' && g.id !== 'frequent' && g.id !== 'starred').map((g) => {
                  const active = draft.groups.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleGroup(g.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-line text-fg-muted hover:bg-bg-muted'
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="px-5 pb-5">
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Notes
              </p>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={3}
                placeholder="Add a note about this contact…"
                className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent scrollbar-thin"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!draft.firstName.trim() && !draft.lastName.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-soft transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
            >
              {editing ? 'Save changes' : 'Create contact'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`${full ? 'col-span-2' : ''} block`}>
      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
        {label}
      </span>
      {children}
    </label>
  );
}
