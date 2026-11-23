import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Contact } from '@/types';
import { contactName, contactInitials } from '@/types';
import { Avatar } from '@/components/Avatar';

export interface Recipient {
  id: string;
  name: string;
  email: string;
  color?: string;
}

interface RecipientFieldProps {
  label: string;
  recipients: Recipient[];
  onAdd: (r: Recipient) => void;
  onRemove: (id: string) => void;
  contacts: Contact[];
  placeholder?: string;
  autoFocus?: boolean;
}

export function RecipientField({
  label,
  recipients,
  onAdd,
  onRemove,
  contacts,
  placeholder,
  autoFocus,
}: RecipientFieldProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const matches = query.trim()
    ? contacts
        .filter((c) => {
          const q = query.toLowerCase();
          return (
            contactName(c).toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q)
          );
        })
        .slice(0, 5)
    : [];

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const addContact = (c: Contact) => {
    if (recipients.some((r) => r.email === c.email)) {
      setQuery('');
      return;
    }
    onAdd({
      id: c.id,
      name: contactName(c),
      email: c.email,
      color: c.avatarColor,
    });
    setQuery('');
  };

  const addRaw = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (recipients.some((r) => r.email === trimmed)) {
      setQuery('');
      return;
    }
    onAdd({ id: `raw-${Date.now()}`, name: trimmed, email: trimmed });
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !query && recipients.length > 0) {
      onRemove(recipients[recipients.length - 1].id);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (matches.length > 0) {
        e.preventDefault();
        addContact(matches[activeIdx]);
      } else if (query.trim()) {
        e.preventDefault();
        addRaw(query);
      }
    } else if (e.key === 'ArrowDown' && matches.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp' && matches.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === ',' || e.key === ' ') {
      if (query.trim()) {
        e.preventDefault();
        addRaw(query);
      }
    }
  };

  return (
    <div className="relative flex items-start gap-2 border-b border-line px-4 py-1.5">
      <span className="mt-1.5 shrink-0 text-xs font-medium text-fg-subtle">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {recipients.map((r) => (
          <span
            key={r.id}
            className="flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-1.5 pr-1 text-xs"
          >
            {r.color && (
              <Avatar initials={r.name.slice(0, 2).toUpperCase()} color={r.color} size="sm" />
            )}
            <span className="font-medium text-fg">{r.name}</span>
            <span className="text-fg-subtle">&lt;{r.email}&gt;</span>
            <button
              onClick={() => onRemove(r.id)}
              className="rounded-full p-0.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (query.trim()) addRaw(query);
            }}
            placeholder={recipients.length === 0 ? placeholder : ''}
            className="w-full bg-transparent py-1 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <AnimatePresence>
            {focused && matches.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-line-strong bg-bg-subtle shadow-pop"
              >
                {matches.map((c, i) => (
                  <button
                    key={c.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addContact(c);
                    }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      i === activeIdx ? 'bg-accent-soft' : 'hover:bg-bg-muted'
                    }`}
                  >
                    <Avatar initials={contactInitials(c)} color={c.avatarColor} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{contactName(c)}</p>
                      <p className="truncate text-2xs text-fg-subtle">{c.email}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
