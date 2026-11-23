import { AnimatePresence, motion } from 'framer-motion';
import { UserPlus, Check, Mail } from 'lucide-react';
import { useState } from 'react';
import type { Email, Contact } from '@/types';
import { Avatar } from '@/components/Avatar';

interface SenderHoverCardProps {
  email: Email;
  isSaved: boolean;
  onAddToContacts: () => void;
  onSendEmail: () => void;
  children: React.ReactNode;
}

export function SenderHoverCard({
  email,
  isSaved,
  onAddToContacts,
  onSendEmail,
  children,
}: SenderHoverCardProps) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(isSaved);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line-strong bg-bg-subtle shadow-pop"
          >
            <div className="flex items-center gap-3 border-b border-line p-3">
              <Avatar initials={email.initials} color={email.avatarColor} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{email.sender}</p>
                <p className="truncate text-2xs text-fg-subtle">{email.senderEmail}</p>
              </div>
            </div>
            <div className="p-2">
              <button
                onClick={() => {
                  if (!saved) {
                    onAddToContacts();
                    setSaved(true);
                  }
                }}
                disabled={saved}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  saved
                    ? 'cursor-default text-success'
                    : 'text-fg hover:bg-bg-muted'
                }`}
              >
                {saved ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {saved ? 'Saved to contacts' : 'Add to contacts'}
              </button>
              <button
                onClick={onSendEmail}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-fg transition-colors hover:bg-bg-muted"
              >
                <Mail className="h-4 w-4" />
                Send email
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function isSenderSaved(email: Email, contacts: Contact[]): boolean {
  return contacts.some((c) => c.email.toLowerCase() === email.senderEmail.toLowerCase());
}
