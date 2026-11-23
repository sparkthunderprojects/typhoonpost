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
  CalendarClock,
  FileText,
  LayoutTemplate,
  PenLine,
  Info,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Contact, Importance } from '@/types';
import type { PayloadAttachment } from '@/lib/crypto/envelope';
import { MAX_TOTAL_BYTES, lookupPublicKeys } from '@/lib/db';
import { mailTips, pickSignature, signatureHtml, type Tip } from '@/lib/mailtips';
import { AttachmentIcon } from '@/components/AttachmentIcon';
import { RecipientField, type Recipient } from '@/components/RecipientField';
import { removeTemplate, saveTemplate, usePrefs } from '@/lib/prefs';
import { listDocuments, openDocument } from '@/documents/store';
import { docxBlob } from '@/documents/exporters';
import { safeFileName } from '@/documents/format';
import type { DocSummary } from '@/documents/types';
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
  /** Hold the message in Drafts and send it from this browser at the given time. */
  onSchedule: (data: ComposeData, at: Date) => void;
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
  contacts: Contact[];
  /** True when this started as a reply to everyone, so a large group can be flagged. */
  replyAll?: boolean;
}

/** Text-only comparison key: the editor rewrites HTML on load, so markup differences do not count. */
function fingerprint(to: string, cc: string, bcc: string, importance: string, subject: string, body: string, files: number): string {
  const text = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return JSON.stringify([to, cc, bcc, importance, subject.trim(), text, files]);
}

/** 8 in the morning, local time, tomorrow or the coming Monday. */
function quickTime(which: 'tomorrow' | 'monday'): Date {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  if (which === 'tomorrow') d.setDate(d.getDate() + 1);
  else d.setDate(d.getDate() + (d.getDay() === 0 ? 1 : 8 - d.getDay()));
  return d;
}

export function Composer({
  state,
  onClose,
  onMinimize,
  onMaximize,
  onRestore,
  onSend,
  onSchedule,
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
  contacts,
  replyAll,
}: ComposerProps) {
  const [toRecipients, setToRecipients] = useState<Recipient[]>([]);
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>([]);
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [importance, setImportance] = useState<Importance>('normal');
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedAt, setSchedAt] = useState('');
  const [attachments, setAttachments] = useState<PayloadAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const prefs = usePrefs();
  const [menu, setMenu] = useState<null | 'templates' | 'docs' | 'signature'>(null);
  const [sigId, setSigId] = useState<string | null>(null);
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [inside, setInside] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [docList, setDocList] = useState<DocSummary[] | null>(null);
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
        setTips(null);
        setSigId(pickSignature(prefs.signatures, prefs.sigNew, prefs.sigReply, /^(re|fw|fwd):\s/i.test(prefillSubject ?? ''))?.id ?? null);
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
    body: withSignature ? body + sigHtml : body,
    attachments,
  });
  const sig = prefs.signatures.find((x) => x.id === sigId);
  const sigHtml = sig ? signatureHtml(sig.text) : '';

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

  // Which recipients are on Typhoonpost, worked out here so the outside note is live as you type.
  useEffect(() => {
    const todo = [...toRecipients, ...ccRecipients, ...bccRecipients].map((r) => r.email).filter((a) => !checked.has(a));
    if (todo.length === 0) return;
    let cancelled = false;
    const t = setTimeout(() => {
      lookupPublicKeys(todo).then((keys) => {
        if (cancelled) return;
        setChecked((c) => new Set([...c, ...todo]));
        setInside((i) => new Set([...i, ...todo.filter((a) => keys.has(a))]));
      }).catch(() => {});
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [toRecipients, ccRecipients, bccRecipients, checked]);
  if (state === 'closed') return null;

  const clearAll = () => {
    setAttachments([]);
    setToRecipients([]);
    setCcRecipients([]);
    setBccRecipients([]);
    setImportance('normal');
    setSubject('');
    setBody('');
    setTips(null);
    baseline.current = fingerprint('', '', '', 'normal', '', '', 0);
    dirtyRef.current = false;
  };

  const finishSend = () => {
    const data = { ...collect(true), subject: subject.trim() || '(No subject)' };
    // A standing delivery delay holds every message, the same way Schedule send does.
    if (prefs.deliveryDelayMin > 0) onSchedule(data, new Date(Date.now() + prefs.deliveryDelayMin * 60_000));
    else onSend(data);
    clearAll();
  };

  /** Things to check before sending. The outside-provider note is shown beside the recipients instead. */
  const blockingTips = (): Tip[] =>
    mailTips({
      to: toRecipients.map((r) => r.email), cc: ccRecipients.map((r) => r.email), bcc: bccRecipients.map((r) => r.email),
      subject, body, attachmentCount: attachments.length, isReplyAll: Boolean(replyAll), inside: () => true,
    });

  const handleSend = () => {
    if (!toRecipients.length) return;
    if (uploading) return;
    const t = blockingTips();
    if (t.length) { setTips(t); return; }
    finishSend();
  };

  const outsideNow = [...toRecipients, ...ccRecipients, ...bccRecipients].map((r) => r.email).filter((a) => checked.has(a) && !inside.has(a));

  const handleSchedule = (at: Date) => {
    if (!toRecipients.length || uploading) return;
    setSchedOpen(false);
    onSchedule({ ...collect(true), subject: subject.trim() || '(No subject)' }, at);
    clearAll();
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

  const insertTemplate = (t: { subject: string; body: string }) => {
    if (!subject.trim() && t.subject) setSubject(t.subject);
    setBody((b) => (b.replace(/<[^>]*>/g, '').trim() ? `${b}${t.body}` : t.body));
    editorKey.current += 1;
    setMenu(null);
  };

  const saveAsTemplate = () => {
    const text = body.replace(/<[^>]*>/g, '').trim();
    if (!text && !subject.trim()) { onError('Write something first, then save it as a template'); return; }
    const name = window.prompt('Name this template', subject.trim() || text.slice(0, 30));
    if (name === null) return;
    saveTemplate({ name, subject, body });
    setMenu(null);
  };

  const openDocs = async () => {
    setMenu((m) => (m === 'docs' ? null : 'docs'));
    try { setDocList((await listDocuments()).filter((d) => !d.trashedAt && !d.undecryptable)); } catch { setDocList([]); }
  };

  const attachDoc = async (d: DocSummary) => {
    setMenu(null);
    setUploading((n) => n + 1);
    try {
      const { body: docBody } = await openDocument(d.id);
      const blob = await docxBlob(d.title, docBody.doc, docBody.page?.size ?? 'a4');
      const file = new File([blob], `${safeFileName(d.title)}.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const att = await onUploadFile(file);
      setAttachments((prev) => [...prev, att]);
    } catch (e) {
      onError(e instanceof Error ? e.message : `Could not attach ${d.title}`);
    } finally {
      setUploading((n) => n - 1);
    }
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
    onClose();
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

        {outsideNow.length > 0 && (
          <p data-testid="outside-note" className="flex items-start gap-2 border-b border-line bg-bg-muted px-3 py-1.5 text-xs text-fg-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {outsideNow.length === 1 ? `${outsideNow[0]} is not on Typhoonpost. Their copy goes through an outside mail provider, which can read it.` : `${outsideNow.length} recipients are not on Typhoonpost. Their copies go through an outside mail provider, which can read them.`}
          </p>
        )}

        {/* WYSIWYG editor */}
        <RichTextEditor
          key={editorKey.current}
          value={body}
          onChange={setBody}
          placeholder="Write your message here..."
          mentions={contacts.filter((c) => c.email).map((c) => ({ name: `${c.firstName} ${c.lastName}`.trim() || c.email, email: c.email }))}
          onMention={(c) => setToRecipients((prev) => (prev.some((r) => r.email.toLowerCase() === c.email.toLowerCase()) ? prev : [...prev, { id: c.email, name: c.name, email: c.email }]))}
        />
      </div>

      {tips && (
        <div role="alertdialog" aria-label="Before you send" data-testid="mail-tips" className="border-t border-line bg-warn/10 px-3 py-2.5 text-sm text-fg">
          <ul className="space-y-1">{tips.map((t) => <li key={t.id} className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" />{t.text}</li>)}</ul>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setTips(null)} className="rounded px-3 py-1 text-sm hover:bg-bg-muted">Go back</button>
            <button onClick={finishSend} className="rounded bg-accent px-3 py-1 text-sm font-medium text-accent-fg">Send anyway</button>
          </div>
        </div>
      )}

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
        <div className="relative">
          <button onClick={openDocs} className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg" title="Attach a Doc" aria-label="Attach a Doc" aria-haspopup="menu" aria-expanded={menu === 'docs'}>
            <FileText className="h-4 w-4" />
          </button>
          {menu === 'docs' && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
              <div role="menu" aria-label="Attach a Doc" className="absolute bottom-full left-0 z-50 mb-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-line-strong bg-bg-subtle py-1 shadow-pop">
                <p className="px-3 py-1.5 text-xs text-fg-muted">Sent as a Word file</p>
                {docList === null && <p className="px-3 py-2 text-sm text-fg-subtle">Loading…</p>}
                {docList?.length === 0 && <p className="px-3 py-2 text-sm text-fg-subtle">No Docs yet.</p>}
                {docList?.map((d) => (
                  <button key={d.id} role="menuitem" onClick={() => attachDoc(d)} className="block w-full truncate px-3 py-2 text-left text-sm text-fg hover:bg-bg-muted">{d.title || 'Untitled'}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setMenu((m) => (m === 'templates' ? null : 'templates'))} className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg" title="Templates" aria-label="Templates" aria-haspopup="menu" aria-expanded={menu === 'templates'}>
            <LayoutTemplate className="h-4 w-4" />
          </button>
          {menu === 'templates' && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
              <div role="menu" aria-label="Templates" className="absolute bottom-full left-0 z-50 mb-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-line-strong bg-bg-subtle py-1 shadow-pop">
                {prefs.templates.length === 0 && <p className="px-3 py-2 text-sm text-fg-subtle">No templates yet. Write a message you reuse, then save it here.</p>}
                {prefs.templates.map((t) => (
                  <div key={t.id} className="group flex items-center hover:bg-bg-muted">
                    <button role="menuitem" onClick={() => insertTemplate(t)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-fg">{t.name}</button>
                    <button aria-label={`Delete template ${t.name}`} onClick={() => removeTemplate(t.id)} className="px-2 text-fg-subtle opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <div className="border-t border-line">
                  <button role="menuitem" onClick={saveAsTemplate} className="block w-full px-3 py-2 text-left text-sm text-accent hover:bg-bg-muted">Save this message as a template</button>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setMenu((m) => (m === 'signature' ? null : 'signature'))} className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg" title="Signature" aria-label="Signature" aria-haspopup="menu" aria-expanded={menu === 'signature'}>
            <PenLine className="h-4 w-4" />
          </button>
          {menu === 'signature' && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
              <div role="menu" aria-label="Signature" className="absolute bottom-full left-0 z-50 mb-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-line-strong bg-bg-subtle py-1 shadow-pop">
                <button role="menuitemradio" aria-checked={sigId === null} onClick={() => { setSigId(null); setMenu(null); }} className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-bg-muted">No signature</button>
                {prefs.signatures.map((x) => (
                  <button key={x.id} role="menuitemradio" aria-checked={sigId === x.id} onClick={() => { setSigId(x.id); setMenu(null); }} className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-bg-muted ${sigId === x.id ? 'font-semibold text-accent' : 'text-fg'}`}>{x.name}</button>
                ))}
                {prefs.signatures.length === 0 && <p className="px-3 py-2 text-xs text-fg-subtle">Add signatures in Mail settings.</p>}
              </div>
            </>
          )}
        </div>
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
          <div className="relative">
            <button
              onClick={() => {
                setSchedOpen((v) => !v);
                setSchedAt('');
              }}
              disabled={!toRecipients.length || uploading > 0}
              aria-label="Schedule send"
              aria-haspopup="menu"
              aria-expanded={schedOpen}
              title="Schedule send"
              className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg disabled:opacity-40"
            >
              <CalendarClock className="h-4 w-4" />
            </button>
            {schedOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSchedOpen(false)} />
                <div role="menu" aria-label="Schedule send" className="absolute bottom-full right-0 z-50 mb-1 w-64 overflow-hidden rounded-lg border border-line-strong bg-bg-subtle py-1 shadow-pop">
                  <p className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Send later</p>
                  {[
                    { label: 'Tomorrow morning', at: quickTime('tomorrow') },
                    { label: 'Monday morning', at: quickTime('monday') },
                  ].map((o) => (
                    <button key={o.label} role="menuitem" onClick={() => handleSchedule(o.at)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-fg hover:bg-bg-muted">
                      {o.label}
                      <span className="text-2xs text-fg-subtle">{o.at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, 8:00</span>
                    </button>
                  ))}
                  <div className="flex items-center gap-2 border-t border-line px-3 py-2">
                    <input
                      type="datetime-local"
                      value={schedAt}
                      onChange={(e) => setSchedAt(e.target.value)}
                      aria-label="Pick a date and time"
                      className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-xs text-fg"
                    />
                    <button
                      disabled={!schedAt || new Date(schedAt).getTime() <= Date.now()}
                      onClick={() => handleSchedule(new Date(schedAt))}
                      className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg disabled:opacity-40"
                    >
                      Schedule
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
