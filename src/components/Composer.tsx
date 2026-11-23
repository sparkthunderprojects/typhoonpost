import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Trash2,
  Send,
  ChevronDown,
  Paperclip,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Contact } from '@/types';
import { RecipientField, type Recipient } from '@/components/RecipientField';
import { RichTextEditor } from '@/components/editor/RichTextEditor';

export type ComposerState = 'closed' | 'open' | 'minimized' | 'fullscreen';

interface ComposerProps {
  state: ComposerState;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onRestore: () => void;
  onSend: (to: string, subject: string, body: string) => void;
  onDiscard: () => void;
  onAutosave: (to: string, subject: string, body: string) => void;
  prefillTo?: Recipient[];
  prefillSubject?: string;
  signature?: string;
  contacts: Contact[];
}

export function Composer({
  state,
  onClose,
  onMinimize,
  onMaximize,
  onRestore,
  onSend,
  onDiscard,
  onAutosave,
  prefillTo,
  prefillSubject,
  signature,
  contacts,
}: ComposerProps) {
  const [toRecipients, setToRecipients] = useState<Recipient[]>([]);
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>([]);
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const dirtyRef = useRef(false);
  const editorKey = useRef(0);

  useEffect(() => {
    if (state === 'open' || state === 'fullscreen') {
      if (prefillTo) setToRecipients(prefillTo);
      if (prefillSubject) setSubject(prefillSubject);
      // remount editor so it picks up fresh content on a new compose session
      editorKey.current += 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const allEmails = [...toRecipients, ...ccRecipients, ...bccRecipients]
    .map((r) => r.email)
    .join(', ');

  // autosave to drafts
  useEffect(() => {
    if (state === 'closed') return;
    dirtyRef.current = !!(allEmails || subject || body);
    if (!dirtyRef.current) return;
    const t = setTimeout(() => onAutosave(allEmails, subject, body), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEmails, subject, body, state]);

  if (state === 'closed') return null;

  const handleSend = () => {
    if (!toRecipients.length) return;
    const sigHtml = signature
      ? `<p style="color: rgb(var(--fg-subtle)); margin-top: 1.5rem;">— ${signature}</p>`
      : '';
    const fullBody = body + sigHtml;
    onSend(allEmails, subject.trim() || '(No subject)', fullBody);
    setToRecipients([]);
    setCcRecipients([]);
    setBccRecipients([]);
    setSubject('');
    setBody('');
    dirtyRef.current = false;
  };

  const handleClose = () => {
    if (dirtyRef.current) onAutosave(allEmails, subject, body);
    onClose();
  };

  const handleDiscard = () => {
    setToRecipients([]);
    setCcRecipients([]);
    setBccRecipients([]);
    setSubject('');
    setBody('');
    dirtyRef.current = false;
    onDiscard();
  };

  // ---- Minimized: small bottom-right tab ----
  if (state === 'minimized') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-0 right-4 z-40 w-72 overflow-hidden rounded-t-xl border border-b-0 border-line-strong bg-bg-subtle shadow-pop"
      >
        <button
          onClick={onRestore}
          className="flex w-full items-center justify-between gap-2 bg-bg-muted px-4 py-2.5 text-left transition-colors hover:bg-bg-muted/80"
        >
          <span className="truncate text-sm font-medium text-fg">
            {subject.trim() || 'New Message'}
          </span>
          <Maximize2 className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        </button>
      </motion.div>
    );
  }

  const fullscreen = state === 'fullscreen';

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-bg-subtle'
    : 'fixed bottom-0 right-4 z-40 flex h-[560px] w-[600px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-t-xl border border-b-0 border-line-strong bg-bg-subtle shadow-pop';

  return (
    <motion.div
      initial={fullscreen ? { opacity: 0, scale: 0.96 } : { opacity: 0, y: 24 }}
      animate={fullscreen ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className={containerClass}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between bg-bg-muted px-4 py-2.5">
        <span className="truncate text-sm font-semibold text-fg">
          {subject.trim() || 'New Message'}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMinimize}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
            aria-label="Minimize"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={onMaximize}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
            aria-label="Maximize"
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Fields + editor */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <RecipientField
          label="To"
          recipients={toRecipients}
          onAdd={(r) => setToRecipients((p) => [...p, r])}
          onRemove={(id) => setToRecipients((p) => p.filter((x) => x.id !== id))}
          contacts={contacts}
          placeholder="Recipients"
          autoFocus={!prefillTo}
        />
        <div className="flex items-center justify-end border-b border-line px-4 py-1">
          <button
            onClick={() => setShowCc((v) => !v)}
            className="flex items-center gap-1 text-2xs font-medium text-fg-subtle transition-colors hover:text-fg"
          >
            {showCc ? 'Hide Cc/Bcc' : 'Cc/Bcc'} <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        {showCc && (
          <>
            <RecipientField
              label="Cc"
              recipients={ccRecipients}
              onAdd={(r) => setCcRecipients((p) => [...p, r])}
              onRemove={(id) => setCcRecipients((p) => p.filter((x) => x.id !== id))}
              contacts={contacts}
              placeholder="Cc recipients"
            />
            <RecipientField
              label="Bcc"
              recipients={bccRecipients}
              onAdd={(r) => setBccRecipients((p) => [...p, r])}
              onRemove={(id) => setBccRecipients((p) => p.filter((x) => x.id !== id))}
              contacts={contacts}
              placeholder="Bcc recipients"
            />
          </>
        )}
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 bg-transparent text-sm font-medium text-fg placeholder:text-fg-subtle focus:outline-none"
          />
        </div>

        {/* WYSIWYG editor */}
        <RichTextEditor
          key={editorKey.current}
          value={body}
          onChange={setBody}
          placeholder="Write your message here..."
        />
      </div>

      {/* Footer send bar */}
      <div className="flex items-center gap-2 border-t border-line bg-bg-muted px-3 py-2">
        <button
          className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
          title="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleDiscard}
            className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
            title="Discard draft"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleSend}
            disabled={!toRecipients.length}
            className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-fg shadow-soft transition-all hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
      </div>
    </motion.div>
  );
}
