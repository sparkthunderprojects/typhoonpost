import { AnimatePresence, motion } from 'framer-motion';
import { Reply, Paperclip, Clock, MailOpen } from 'lucide-react';
import type { Email, Contact } from '@/types';
import { LABEL_DEFS } from '@/types';
import { Avatar } from '@/components/Avatar';
import { AttachmentIcon } from '@/components/AttachmentIcon';
import { SenderHoverCard, isSenderSaved } from '@/components/SenderHoverCard';
import { MessageBody } from '@/components/MessageBody';

interface EmailReaderProps {
  email: Email | null;
  onReply: () => void;
  contacts: Contact[];
  onAddToContacts: (email: Email) => void;
}

export function EmailReader({
  email,
  onReply,
  contacts,
  onAddToContacts,
}: EmailReaderProps) {
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

                <MessageBody html={email.body} senderEmail={email.senderEmail} />

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
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-muted text-accent/70">
              <MailOpen className="h-7 w-7" />
            </div>
            <p className="text-base font-semibold text-fg-muted">Select an item to read</p>
            <p className="max-w-[240px] text-center text-sm">Nothing is selected. Pick a message from the list.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
