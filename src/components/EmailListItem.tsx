import { motion } from 'framer-motion';
import { Flag, Paperclip, Reply, Archive, Trash2, Mail, Clock, Pin } from 'lucide-react';
import type { Email } from '@/types';
import { categoryDef, usePrefs } from '@/lib/prefs';
import { Avatar } from '@/components/Avatar';

interface EmailListItemProps {
  email: Email;
  active: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleStar: () => void;
  onQuickArchive: () => void;
  onQuickDelete: () => void;
  onQuickMarkUnread: () => void;
  onQuickSnooze: (e: React.MouseEvent) => void;
  onTogglePin: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

export function EmailListItem({
  email,
  active,
  selected,
  onOpen,
  onToggleSelect,
  onToggleStar,
  onQuickArchive,
  onQuickDelete,
  onQuickMarkUnread,
  onQuickSnooze,
  onTogglePin,
  onDragStart,
}: EmailListItemProps) {
  const prefs = usePrefs();
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className={`group relative flex cursor-pointer gap-3 border-b border-line px-4 py-3 transition-colors ${
        active ? 'bg-accent-soft/60' : 'hover:bg-bg-muted/60'
      }`}
    >
      {active && (
        <motion.span
          layoutId="email-active"
          className="absolute left-0 top-0 h-full w-[3px] bg-accent"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}

      <div className="flex items-start pt-0.5">
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelect}
          className="mt-1 h-3.5 w-3.5 cursor-pointer rounded border-line-strong text-accent opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          style={{ opacity: selected ? 1 : undefined }}
        />
      </div>

      <Avatar initials={email.initials} color={email.avatarColor} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`truncate text-sm ${
              email.read ? 'font-normal text-fg-muted' : 'font-semibold text-fg'
            }`}
          >
            {(email.folder === 'sent' || email.folder === 'drafts') && email.toAddresses?.length
              ? `To: ${email.toAddresses.join(', ')}`
              : email.sender}
          </span>
          {email.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-accent" aria-label="Pinned" />}
          {email.snoozedUntil && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-2xs font-medium text-warning">
              <Clock className="h-2.5 w-2.5" />
              {email.snoozedUntil}
            </span>
          )}
          {email.attachments.length > 0 && (
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          )}
          {email.hasReplies && <Reply className="h-3 w-3 shrink-0 text-fg-subtle" />}
          <span className="ml-auto shrink-0 text-2xs font-medium text-fg-subtle">
            {email.timestamp}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          {!email.read && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          )}
          <span
            className={`truncate text-[13px] ${
              email.read ? 'font-normal text-fg-muted' : 'font-medium text-fg'
            }`}
          >
            {email.subject}
          </span>
        </div>

        <p className="mt-1 truncate text-xs text-fg-subtle">{email.preview}</p>

        {email.labels.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1">
            {email.labels.map((l) => {
              const def = categoryDef(l, prefs);
              return (
                <span
                  key={l}
                  className="rounded px-1.5 py-0.5 text-2xs font-medium"
                  style={{
                    backgroundColor: `${def?.color}1a`,
                    color: def?.color,
                  }}
                >
                  {def?.name ?? l}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Star */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar();
        }}
        className="absolute right-3 top-7 shrink-0 p-1"
        aria-label="Flag"
      >
        <Flag
          className={`h-4 w-4 transition-colors ${
            email.starred
              ? 'fill-warning text-warning'
              : 'text-fg-subtle opacity-0 group-hover:opacity-100'
          }`}
        />
      </button>

      {/* Hover quick actions */}
      <div className="absolute bottom-2.5 right-3 flex items-center gap-0.5 rounded-lg border border-line bg-bg-subtle/95 p-0.5 opacity-0 shadow-soft backdrop-blur transition-opacity group-hover:opacity-100">
        <QuickBtn title={email.pinned ? 'Unpin' : 'Pin to top'} onClick={(e) => { e.stopPropagation(); onTogglePin(); }}>
          <Pin className={`h-3.5 w-3.5 ${email.pinned ? 'fill-current text-accent' : ''}`} />
        </QuickBtn>
        <QuickBtn title="Archive" onClick={(e) => { e.stopPropagation(); onQuickArchive(); }}>
          <Archive className="h-3.5 w-3.5" />
        </QuickBtn>
        <QuickBtn title="Mark unread" onClick={(e) => { e.stopPropagation(); onQuickMarkUnread(); }}>
          <Mail className="h-3.5 w-3.5" />
        </QuickBtn>
        <QuickBtn title="Snooze" onClick={onQuickSnooze}>
          <Clock className="h-3.5 w-3.5" />
        </QuickBtn>
        <QuickBtn title="Delete" danger onClick={(e) => { e.stopPropagation(); onQuickDelete(); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </QuickBtn>
      </div>
    </div>
  );
}

function QuickBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-md p-1 transition-colors ${
        danger
          ? 'text-fg-subtle hover:bg-danger/10 hover:text-danger'
          : 'text-fg-subtle hover:bg-bg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
