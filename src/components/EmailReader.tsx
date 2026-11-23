import { AnimatePresence, motion } from 'framer-motion';
import { Reply, Paperclip, Clock, MailOpen, Flag, ArrowLeft } from 'lucide-react';
import type { Email, Contact, Attachment } from '@/types';
import { categoryDef, setScheduled, usePrefs } from '@/lib/prefs';
import { Avatar } from '@/components/Avatar';
import { AttachmentIcon } from '@/components/AttachmentIcon';
import { SenderHoverCard, isSenderSaved } from '@/components/SenderHoverCard';
import { MessageBody } from '@/components/MessageBody';

interface EmailReaderProps {
  email: Email | null;
  onReply: () => void;
  contacts: Contact[];
  onAddToContacts: (email: Email) => void;
  onDownloadAttachment: (att: Attachment) => void;
  onEditDraft: (email: Email) => void;
  /** 'side' sits beside the list; 'full' fills the space under or instead of it. */
  layout?: 'side' | 'full';
  onBack?: () => void;
  /** Every message in this conversation, oldest first (includes this one). */
  thread?: Email[];
  onOpenMessage?: (id: string) => void;
  /** Shown above the message when it carries a meeting invitation. */
  inviteCard?: React.ReactNode;
}

export function EmailReader({
  email,
  onReply,
  contacts,
  onAddToContacts,
  onDownloadAttachment,
  onEditDraft,
  layout = 'side',
  onBack,
  thread = [],
  onOpenMessage,
  inviteCard,
}: EmailReaderProps) {
  const prefs = usePrefs();
  return (
    <section
      className={`flex h-full flex-1 flex-col bg-bg-subtle ${layout === 'side' ? 'w-[42%] min-w-[380px] max-w-[640px]' : 'w-full min-w-0'}`}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-1.5 border-b border-line px-4 py-2 text-left text-sm text-accent hover:bg-bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> Back to list
        </button>
      )}
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
                      const def = categoryDef(l, prefs);
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
                    {(email.toAddresses?.length || email.ccAddresses?.length || email.bccAddresses?.length) ? (
                      <div className="mt-0.5 space-y-0.5 text-2xs text-fg-subtle" data-testid="reader-recipients">
                        {email.toAddresses?.length ? <p className="truncate">To: {email.toAddresses.join(', ')}</p> : null}
                        {email.ccAddresses?.length ? <p className="truncate">Cc: {email.ccAddresses.join(', ')}</p> : null}
                        {email.bccAddresses?.length ? <p className="truncate">Bcc: {email.bccAddresses.join(', ')}</p> : null}
                      </div>
                    ) : null}
                    <div className="mt-1 flex items-center gap-3 text-2xs text-fg-subtle">
                      {email.importance === 'high' && (
                        <span className="rounded bg-danger/10 px-1.5 py-0.5 font-medium text-danger">High importance</span>
                      )}
                      {email.importance === 'low' && (
                        <span className="rounded bg-bg-muted px-1.5 py-0.5 font-medium">Low importance</span>
                      )}
                      {email.followUpAt && (
                        <span className="flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                          <Flag className="h-3 w-3" /> Follow up {new Date(email.followUpAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
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

                {thread.length > 1 && (
                  <div className="mt-4 rounded-lg border border-line bg-bg" data-testid="conversation">
                    <p className="border-b border-line px-3 py-1.5 text-2xs font-semibold text-fg-muted">
                      Conversation · {thread.length} messages
                    </p>
                    {thread.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onOpenMessage?.(m.id)}
                        aria-current={m.id === email.id}
                        className={`flex w-full items-center gap-2 border-b border-line px-3 py-1.5 text-left text-xs last:border-b-0 hover:bg-bg-muted ${
                          m.id === email.id ? 'bg-accent-soft/50 font-medium text-fg' : 'text-fg-muted'
                        }`}
                      >
                        <span className="w-28 shrink-0 truncate">{m.folder === 'sent' ? 'You' : m.sender}</span>
                        <span className="min-w-0 flex-1 truncate text-fg-subtle">{m.preview}</span>
                        <span className="shrink-0 text-2xs text-fg-subtle">{m.date}</span>
                      </button>
                    ))}
                  </div>
                )}

                {inviteCard}
                {!inviteCard && <MessageBody html={email.body} senderEmail={email.senderEmail} />}

                {email.attachments.length > 0 && (
                  <div className="mt-8">
                    <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                      <Paperclip className="h-3 w-3" />
                      {email.attachments.length} Attachment
                      {email.attachments.length > 1 ? 's' : ''}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {email.attachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          disabled={!att.file}
                          onClick={() => onDownloadAttachment(att)}
                          title={att.file ? `Download ${att.name}` : 'The file itself was not stored'}
                          className="flex items-center gap-3 rounded-xl border border-line bg-bg p-3 text-left transition-colors hover:border-line-strong hover:bg-bg-muted disabled:cursor-default"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-muted">
                            <AttachmentIcon kind={att.kind} className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-fg">{att.name}</p>
                            <p className="text-2xs text-fg-subtle">{att.size}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Reply bar */}
            <div className="border-t border-line p-3">
              {email.folder === 'drafts' && prefs.scheduled[email.id] && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning" data-testid="scheduled-banner">
                  <span>
                    Scheduled for{' '}
                    {new Date(prefs.scheduled[email.id]).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button onClick={() => setScheduled(email.id, null)} className="font-semibold underline">Cancel schedule</button>
                </div>
              )}
              {email.folder === 'drafts' ? (
                <button
                  onClick={() => onEditDraft(email)}
                  className="flex w-full items-center gap-2 rounded-xl border border-line bg-bg px-4 py-2.5 text-left text-sm text-fg transition-colors hover:border-accent hover:bg-accent-soft/40"
                >
                  <Reply className="h-4 w-4" />
                  Continue editing this draft
                </button>
              ) : (
                <button
                  onClick={onReply}
                  className="flex w-full items-center gap-2 rounded-xl border border-line bg-bg px-4 py-2.5 text-left text-sm text-fg-subtle transition-colors hover:border-accent hover:bg-accent-soft/40"
                >
                  <Reply className="h-4 w-4" />
                  Reply to {email.sender}…
                </button>
              )}
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
