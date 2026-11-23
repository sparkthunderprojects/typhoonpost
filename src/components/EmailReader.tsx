import { AnimatePresence, motion } from 'framer-motion';
import {
  Reply,
  ReplyAll,
  Forward,
  FolderInput,
  Archive,
  Trash2,
  Star,
  Paperclip,
  Clock,
  MailOpen,
  Tag,
} from 'lucide-react';
import { useState } from 'react';
import type { Email, LabelId, Contact } from '@/types';
import { LABEL_DEFS } from '@/types';
import { Avatar } from '@/components/Avatar';
import { AttachmentIcon } from '@/components/AttachmentIcon';
import { SnoozeMenu, type SnoozeOption } from '@/components/SnoozeMenu';
import { LabelPicker } from '@/components/LabelPicker';
import { SenderHoverCard, isSenderSaved } from '@/components/SenderHoverCard';

interface EmailReaderProps {
  email: Email | null;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleStar: () => void;
  onSnooze: (opt: SnoozeOption) => void;
  onToggleLabel: (label: LabelId) => void;
  contacts: Contact[];
  onAddToContacts: (email: Email) => void;
}

export function EmailReader({
  email,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
  onToggleStar,
  onSnooze,
  onToggleLabel,
  contacts,
  onAddToContacts,
}: EmailReaderProps) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

  return (
    <section className="flex h-full w-[42%] min-w-[380px] max-w-[640px] flex-1 flex-col bg-bg-subtle">
      <AnimatePresence mode="wait">
        {email ? (
          <motion.div
            key={email.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
            className="flex h-full flex-col"
          >
            {/* Toolbar */}
            <div className="relative flex items-center gap-1 border-b border-line px-3 py-2">
              <ReaderBtn Icon={Reply} label="Reply" onClick={onReply} />
              <ReaderBtn Icon={ReplyAll} label="Reply All" onClick={onReplyAll} />
              <ReaderBtn Icon={Forward} label="Forward" onClick={onForward} />
              <div className="relative">
                <ReaderBtn Icon={Clock} label="Snooze" onClick={() => setSnoozeOpen((v) => !v)} active={snoozeOpen} />
                <SnoozeMenu open={snoozeOpen} onClose={() => setSnoozeOpen(false)} onSnooze={onSnooze} />
              </div>
              <div className="relative">
                <ReaderBtn Icon={Tag} label="Labels" onClick={() => setLabelOpen((v) => !v)} active={labelOpen} />
                <LabelPicker
                  open={labelOpen}
                  onClose={() => setLabelOpen(false)}
                  current={email.labels}
                  onToggle={onToggleLabel}
                />
              </div>
              <ReaderBtn Icon={FolderInput} label="Move" onClick={() => {}} />
              <ReaderBtn Icon={Archive} label="Archive" onClick={onArchive} />
              <ReaderBtn Icon={Trash2} label="Delete" onClick={onDelete} danger />
              <button
                onClick={onToggleStar}
                className="ml-auto rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
                aria-label="Star"
              >
                <Star
                  className={`h-4 w-4 ${email.starred ? 'fill-warning text-warning' : ''}`}
                />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <div className="px-6 py-5">
                <h1 className="text-xl font-semibold leading-snug tracking-tight text-fg">
                  {email.subject}
                </h1>

                {email.labels.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {email.labels.map((l) => {
                      const def = LABEL_DEFS.find((d) => d.id === l);
                      return (
                        <span
                          key={l}
                          className="rounded px-1.5 py-0.5 text-2xs font-medium"
                          style={{ backgroundColor: `${def?.color}1a`, color: def?.color }}
                        >
                          {def?.name ?? l}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 flex items-start gap-3">
                  <SenderHoverCard
                    email={email}
                    isSaved={isSenderSaved(email, contacts)}
                    onAddToContacts={() => onAddToContacts(email)}
                    onSendEmail={onReply}
                  >
                    <Avatar initials={email.initials} color={email.avatarColor} size="lg" />
                  </SenderHoverCard>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-fg">{email.sender}</span>
                      <span className="truncate text-xs text-fg-subtle">
                        &lt;{email.senderEmail}&gt;
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-2xs text-fg-subtle">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {email.date} · {email.timestamp}
                      </span>
                      {email.snoozedUntil && (
                        <span className="flex items-center gap-1 text-warning">
                          <Clock className="h-3 w-3" /> Snoozed until {email.snoozedUntil}
                        </span>
                      )}
                      {email.hasReplies && (
                        <span className="flex items-center gap-1">
                          <Reply className="h-3 w-3" />2 in thread
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className="email-body mt-6 text-sm leading-relaxed text-fg"
                  dangerouslySetInnerHTML={{ __html: email.body }}
                />

                {email.attachments.length > 0 && (
                  <div className="mt-8">
                    <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                      <Paperclip className="h-3 w-3" />
                      {email.attachments.length} Attachment
                      {email.attachments.length > 1 ? 's' : ''}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {email.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-3 rounded-xl border border-line bg-bg p-3 transition-colors hover:border-line-strong hover:bg-bg-muted"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-muted">
                            <AttachmentIcon kind={att.kind} className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-fg">{att.name}</p>
                            <p className="text-2xs text-fg-subtle">{att.size}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Reply bar */}
            <div className="border-t border-line p-3">
              <button
                onClick={onReply}
                className="flex w-full items-center gap-2 rounded-xl border border-line bg-bg px-4 py-2.5 text-left text-sm text-fg-subtle transition-colors hover:border-accent hover:bg-accent-soft/40"
              >
                <Reply className="h-4 w-4" />
                Reply to {email.sender}…
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full flex-col items-center justify-center gap-3 text-fg-subtle"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-muted">
              <MailOpen className="h-6 w-6 opacity-50" />
            </div>
            <p className="text-sm font-medium">No message selected</p>
            <p className="max-w-[220px] text-center text-xs">
              Select an email from the list to read it here.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ReaderBtn({
  Icon,
  label,
  onClick,
  danger,
  active,
}: {
  Icon: typeof Reply;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-accent-soft text-accent'
          : danger
            ? 'text-fg-muted hover:bg-danger/10 hover:text-danger'
            : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}
