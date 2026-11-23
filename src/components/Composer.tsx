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
  AlertCircle,
  ArrowDown,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Contact, Importance } from '@/types';
import type { PayloadAttachment } from '@/lib/crypto/envelope';
import { MAX_TOTAL_BYTES } from '@/lib/db';
import { AttachmentIcon } from '@/components/AttachmentIcon';
import { RecipientField, type Recipient } from '@/components/RecipientField';
import { RichTextEditor } from '@/components/editor/RichTextEditor';

/** Everything the composer hands back for sending or saving as a draft. */
export interface ComposeData {
  to: string;
  cc: string;
  bcc: string;
  importance: Importance;
  subject: string;
  body: string;
  attachments: PayloadAttachment[];
}

export type ComposerState = 'closed' | 'open' | 'minimized' | 'fullscreen';

interface ComposerProps {
  state: ComposerState;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onRestore: () => void;
  onSend: (data: ComposeData) => void;
  onDiscard: () => void;
  onAutosave: (data: ComposeData) => void;
  onUploadFile: (file: File) => Promise<PayloadAttachment>;
  onRemoveFile: (fileId: string) => void;
  onError: (message: string) => void;
  prefillTo?: Recipient[];
  prefillCc?: Recipient[];
  prefillBcc?: Recipient[];
  prefillImportance?: Importance;
  prefillSubject?: string;
  prefillBody?: string;
  prefillAttachments?: PayloadAttachment[];
  /** Changes whenever a new compose session starts, so a resumed draft replaces what was typed. */
  sessionId?: number;
  signature?: string;
  contacts: Contact[];
}

/** Text-only comparison key: the editor rewrites HTML on load, so markup differences do not count. */
function fingerprint(to: string, cc: string, bcc: string, importance: string, subject: string, body: string, files: number): string {
  const text = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return JSON.stringify([to, cc, bcc, importance, subject.trim(), text, files]);
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
  onUploadFile,
  onRemoveFile,
  onError,
  prefillTo,
  prefillCc,
  prefillBcc,
  prefillImportance,
  prefillSubject,
  prefillBody,
  prefillAttachments,
  sessionId,
  signature,
  contacts,
}: ComposerProps) {
  const [toRecipients, setToRecipients] = useState<Recipient[]>([]);
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>([]);
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [importance, setImportance] = useState<Importance>('normal');
  const [attachments, setAttachments] = useState<PayloadAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const appliedSession = useRef<number | undefined>(undefined);
  const dirtyRef = useRef(false);
  /** What the session started with, so opening a reply and closing it again saves nothing. */
  const baseline = useRef('');
  const editorKey = useRef(0);

  useEffect(() => {
    if (state === 'open' || state === 'fullscreen') {
      // Each new compose session (new mail, reply, forward, resumed draft) starts from its own
      // prefill. Restoring a minimised window keeps whatever was typed.
      if (sessionId !== undefined && appliedSession.current !== sessionId) {
        appliedSession.current = sessionId;
        setToRecipients(prefillTo ?? []);
        setCcRecipients(prefillCc ?? []);
        setBccRecipients(prefillBcc ?? []);
        setShowCc(Boolean(prefillCc?.length || prefillBcc?.length));
        setImportance(prefillImportance ?? 'normal');
        setSubject(prefillSubject ?? '');
        setBody(prefillBody ?? '');
        setAttachments(prefillAttachments ?? []);
        baseline.current = fingerprint(
          (prefillTo ?? []).map((r) => r.email).join(','),
          (prefillCc ?? []).map((r) => r.email).join(','),
          (prefillBcc ?? []).map((r) => r.email).join(','),
          prefillImportance ?? 'normal',
          prefillSubject ?? '',
          prefillBody ?? '',
          (prefillAttachments ?? []).length,
        );
        // remount editor so it picks up fresh content on a new compose session
        editorKey.current += 1;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sessionId]);

  const join = (list: Recipient[]) => list.map((r) => r.email).join(', ');
  const toStr = join(toRecipients);
  const ccStr = join(ccRecipients);
  const bccStr = join(bccRecipients);
  const allEmails = [toStr, ccStr, bccStr].filter(Boolean).join(', ');
  const collect = (withSignature = false): ComposeData => ({
    to: toStr,
    cc: ccStr,
    bcc: bccStr,
    importance,
    subject,
    body: withSignature ? body + signatureHtml : body,
    attachments,
  });
  const signatureHtml = signature
    ? `<p style="color: rgb(var(--fg-subtle)); margin-top: 1.5rem;">— ${signature}</p>`
    : '';

  // autosave to drafts
  useEffect(() => {
    if (state === 'closed') return;
    dirtyRef.current =
      fingerprint(toStr, ccStr, bccStr, importance, subject, body, attachments.length) !== baseline.current;
    if (!dirtyRef.current) return;
    const t = setTimeout(() => onAutosave(collect()), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toStr, ccStr, bccStr, importance, subject, body, attachments, state]);

  if (state === 'closed') return null;

  const handleSend = () => {
    if (!toRecipients.length) return;
    if (uploading) return;
    onSend({ ...collect(true), subject: subject.trim() || '(No subject)' });
    setAttachments([]);
    setToRecipients([]);
    setCcRecipients([]);
    setBccRecipients([]);
    setImportance('normal');
    setSubject('');
    setBody('');
    baseline.current = fingerprint('', '', '', 'normal', '', '', 0);
    dirtyRef.current = false;
  };

  const handleClose = () => {
    if (dirtyRef.current) onAutosave(collect());
    onClose();
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    let total = attachments.reduce((n, a) => n + (a.file?.bytes ?? 0), 0);
    for (const f of Array.from(files)) {
      if (total + f.size > MAX_TOTAL_BYTES) {
        onError('Attachments can add up to 25 MB per message');
        break;
      }
      total += f.size;
      setUploading((n) => n + 1);
      try {
        const att = await onUploadFile(f);
        setAttachments((prev) => [...prev, att]);
      } catch (e) {
        onError(e instanceof Error ? e.message : `Could not attach ${f.name}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeAttachment = (a: PayloadAttachment) => {
    setAttachments((prev) => prev.filter((x) => x !== a));
    if (a.file) onRemoveFile(a.file.id);
  };

  const handleDiscard = () => {
    attachments.forEach((a) => a.file && onRemoveFile(a.file.id));
    setAttachments([]);
    setToRecipients([]);
    setCcRecipients([]);
    setBccRecipients([]);
    setImportance('normal');
    setSubject('');
    setBody('');
    baseline.current = fingerprint('', '', '', 'normal', '', '', 0);
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
          autoFocus={!prefillTo?.length}
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

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2" data-testid="composer-attachments">
            {attachments.map((a) => (
              <span key={a.file?.id ?? a.name} className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2 py-1 text-xs text-fg">
                <AttachmentIcon kind={a.kind} className="h-3.5 w-3.5" />
                <span className="max-w-[160px] truncate">{a.name}</span>
                <span className="text-fg-subtle">{a.size}</span>
                <button onClick={() => removeAttachment(a)} aria-label={`Remove ${a.name}`} className="text-fg-subtle hover:text-danger">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

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
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} data-testid="attach-input" />
        <button
          onClick={() => fileInput.current?.click()}
          className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
          title="Attach file"
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          onClick={() => setImportance((v) => (v === 'high' ? 'normal' : 'high'))}
          className={`rounded-lg p-1.5 transition-colors hover:bg-bg ${importance === 'high' ? 'text-danger' : 'text-fg-subtle hover:text-fg'}`}
          title={importance === 'high' ? 'High importance (on)' : 'Mark as high importance'}
          aria-label="High importance"
          aria-pressed={importance === 'high'}
        >
          <AlertCircle className="h-4 w-4" />
        </button>
        <button
          onClick={() => setImportance((v) => (v === 'low' ? 'normal' : 'low'))}
          className={`rounded-lg p-1.5 transition-colors hover:bg-bg ${importance === 'low' ? 'text-accent' : 'text-fg-subtle hover:text-fg'}`}
          title={importance === 'low' ? 'Low importance (on)' : 'Mark as low importance'}
          aria-label="Low importance"
          aria-pressed={importance === 'low'}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        {uploading > 0 && <span className="text-2xs text-fg-subtle">Encrypting and uploading…</span>}
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
            disabled={!toRecipients.length || uploading > 0}
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
