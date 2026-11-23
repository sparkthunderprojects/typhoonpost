import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import {
  addSender, categoryDefs, folderTree, newId, removeQuickStep, removeRule, removeSender, removeTemplate, saveQuickStep, saveRule, saveTemplate, setAutoEmptyDays, setAutoReply, setUndoSendSeconds, usePrefs,
} from '@/lib/prefs';
import { emptyRule, type MailRule } from '@/lib/rules';
import { ACTION_LABELS, type QuickAction, type QuickStep } from '@/lib/quicksteps';

type Tab = 'sending' | 'rules' | 'quicksteps' | 'templates' | 'senders' | 'autoreply';
const TABS: { id: Tab; label: string }[] = [
  { id: 'sending', label: 'Sending' },
  { id: 'rules', label: 'Rules' },
  { id: 'quicksteps', label: 'Quick steps' },
  { id: 'templates', label: 'Templates' },
  { id: 'senders', label: 'Blocked and safe' },
  { id: 'autoreply', label: 'Automatic replies' },
];

const field = 'w-full rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none';
const label = 'mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Applies the rules to everything in the inbox now; returns how many messages changed. */
  onRunRules: () => number;
}

export function MailSettingsDialog({ open, onClose, onRunRules }: Props) {
  const [tab, setTab] = useState<Tab>('sending');
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Mail settings"
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-bg-subtle shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-line bg-bg-muted px-4 py-3">
              <span className="text-sm font-semibold text-fg">Mail settings</span>
              <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-fg-subtle hover:bg-bg hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex border-b border-line px-2" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative px-3 py-2.5 text-sm ${tab === t.id ? 'font-semibold text-fg' : 'text-fg-muted hover:text-fg'}`}
                >
                  {t.label}
                  {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-t bg-accent" />}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
              {tab === 'sending' && <SendingTab />}
              {tab === 'rules' && <RulesTab onRun={onRunRules} />}
              {tab === 'quicksteps' && <QuickStepsTab />}
              {tab === 'templates' && <TemplatesTab />}
              {tab === 'senders' && <SendersTab />}
              {tab === 'autoreply' && <AutoReplyTab />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg bg-bg-muted px-3 py-2 text-xs leading-relaxed text-fg-muted">{children}</p>
);

function SendingTab() {
  const prefs = usePrefs();
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="undo-send" className={label}>Undo send</label>
        <select id="undo-send" value={prefs.undoSendSeconds} onChange={(e) => setUndoSendSeconds(Number(e.target.value))} className={field}>
          <option value={0}>Send straight away</option>
          <option value={5}>Hold for 5 seconds</option>
          <option value={10}>Hold for 10 seconds</option>
          <option value={20}>Hold for 20 seconds</option>
          <option value={30}>Hold for 30 seconds</option>
        </select>
        <p className="mt-1.5 text-xs text-fg-subtle">While a message is held you can take it back. If you close Typhoonpost during that time it is not sent, and stays in Drafts.</p>
      </div>
      <div>
        <label htmlFor="auto-empty" className={label}>Empty Deleted Items automatically</label>
        <select id="auto-empty" value={prefs.autoEmptyDays} onChange={(e) => setAutoEmptyDays(Number(e.target.value))} className={field}>
          <option value={0}>Never</option>
          <option value={7}>After 7 days</option>
          <option value={30}>After 30 days</option>
          <option value={90}>After 90 days</option>
        </select>
        <p className="mt-1.5 text-xs text-fg-subtle">Messages are removed for good, from this browser, when Typhoonpost opens. Days count from when this browser first saw the message in Deleted Items.</p>
      </div>
      <Note>
        Scheduled messages wait in Drafts, encrypted like everything else. Typhoonpost cannot read them, so it cannot send them for you:
        they go out from this browser at the chosen time while Typhoonpost is open, or the next time you open it.
      </Note>
    </div>
  );
}

function RulesTab({ onRun }: { onRun: () => number }) {
  const prefs = usePrefs();
  const [editing, setEditing] = useState<MailRule | null>(null);
  const [ran, setRan] = useState<number | null>(null);
  const folders = [
    { id: 'archive', name: 'Archive' }, { id: 'inbox', name: 'Inbox' }, { id: 'spam', name: 'Junk Email' },
    ...folderTree(prefs).map(({ folder, depth }) => ({ id: `f:${folder.id}`, name: `${'– '.repeat(depth)}${folder.name}` })),
  ];
  if (editing) {
    const set = (patch: Partial<MailRule>) => setEditing({ ...editing, ...patch });
    const hasCondition = Boolean(editing.from || editing.subject || editing.body || editing.hasAttachment || editing.importance);
    return (
      <div className="space-y-3">
        <div>
          <label htmlFor="rule-name" className={label}>Rule name</label>
          <input id="rule-name" value={editing.name} onChange={(e) => set({ name: e.target.value })} className={field} />
        </div>
        <p className="text-xs font-semibold text-fg">When a message arrives and</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="rule-from" className={label}>From contains</label><input id="rule-from" value={editing.from} onChange={(e) => set({ from: e.target.value })} className={field} placeholder="name or address" /></div>
          <div><label htmlFor="rule-subject" className={label}>Subject contains</label><input id="rule-subject" value={editing.subject} onChange={(e) => set({ subject: e.target.value })} className={field} /></div>
          <div><label htmlFor="rule-body" className={label}>Text contains</label><input id="rule-body" value={editing.body} onChange={(e) => set({ body: e.target.value })} className={field} /></div>
          <div>
            <label htmlFor="rule-importance" className={label}>Importance</label>
            <select id="rule-importance" value={editing.importance} onChange={(e) => set({ importance: e.target.value as MailRule['importance'] })} className={field}>
              <option value="">Any</option><option value="high">High</option><option value="low">Low</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={editing.hasAttachment} onChange={(e) => set({ hasAttachment: e.target.checked })} /> Has an attachment</label>
        <p className="text-xs font-semibold text-fg">Then</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rule-move" className={label}>Move to</label>
            <select id="rule-move" value={editing.moveTo} onChange={(e) => set({ moveTo: e.target.value })} className={field} disabled={editing.delete}>
              <option value="">Leave where it is</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rule-cat" className={label}>Add category</label>
            <select id="rule-cat" value={editing.addLabel} onChange={(e) => set({ addLabel: e.target.value })} className={field}>
              <option value="">None</option>
              {categoryDefs(prefs).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-fg">
          <label className="flex items-center gap-2"><input type="checkbox" checked={editing.markRead} onChange={(e) => set({ markRead: e.target.checked })} /> Mark as read</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={editing.flag} onChange={(e) => set({ flag: e.target.checked })} /> Flag</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={editing.pin} onChange={(e) => set({ pin: e.target.checked })} /> Pin to top</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={editing.delete} onChange={(e) => set({ delete: e.target.checked })} /> Move to Deleted Items</label>
        </div>
        {!hasCondition && <p className="text-xs text-danger">Fill in at least one condition. A rule with none would never run.</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-muted">Cancel</button>
          <button
            disabled={!hasCondition || !editing.name.trim()}
            onClick={() => { saveRule(editing); setEditing(null); }}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-fg disabled:opacity-40"
          >
            Save rule
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Note>Rules run in this browser on new mail while Typhoonpost is open. Mail that arrives while it is closed is sorted the next time you open it.</Note>
      {prefs.rules.length === 0 && <p className="py-4 text-center text-sm text-fg-muted">No rules yet.</p>}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {prefs.rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2">
            <input type="checkbox" checked={r.enabled} onChange={(e) => saveRule({ ...r, enabled: e.target.checked })} aria-label={`Turn ${r.name} on or off`} />
            <button onClick={() => setEditing(r)} className="min-w-0 flex-1 truncate text-left text-sm text-fg hover:underline">{r.name}</button>
            <button onClick={() => removeRule(r.id)} aria-label={`Delete ${r.name}`} className="text-fg-subtle hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        <button onClick={() => setEditing(emptyRule(newId()))} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg">
          <Plus className="h-4 w-4" /> New rule
        </button>
        <div className="flex items-center gap-3">
          {ran !== null && <span className="text-xs text-fg-muted" role="status">{ran === 0 ? 'Nothing to change' : `Changed ${ran} message${ran === 1 ? '' : 's'}`}</span>}
          <button onClick={() => setRan(onRun())} disabled={!prefs.rules.length && !prefs.blocked.length} className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:bg-bg-muted disabled:opacity-40">
            Run on the inbox now
          </button>
        </div>
      </div>
    </div>
  );
}

function SenderList({ title, list, items }: { title: string; list: 'blocked' | 'safe'; items: string[] }) {
  const [value, setValue] = useState('');
  const add = () => { addSender(list, value); setValue(''); };
  return (
    <div>
      <p className={label}>{title}</p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="name@example.org or example.org"
          aria-label={`Add to ${title}`}
          className={field}
        />
        <button onClick={add} disabled={!value.trim()} className="rounded-lg border border-line px-3 text-sm text-fg hover:bg-bg-muted disabled:opacity-40">Add</button>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((s) => (
          <li key={s} className="flex items-center justify-between rounded-md bg-bg-muted px-2.5 py-1.5 text-sm text-fg">
            {s}
            <button onClick={() => removeSender(list, s)} aria-label={`Remove ${s}`} className="text-fg-subtle hover:text-danger"><X className="h-3.5 w-3.5" /></button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-fg-subtle">None</li>}
      </ul>
    </div>
  );
}

function SendersTab() {
  const prefs = usePrefs();
  return (
    <div className="space-y-5">
      <SenderList title="Blocked senders" list="blocked" items={prefs.blocked} />
      <SenderList title="Safe senders" list="safe" items={prefs.safe} />
      <Note>Mail from a blocked sender goes to Junk Email when it arrives. A safe sender is never blocked. A domain entry covers every address at that domain.</Note>
    </div>
  );
}

function AutoReplyTab() {
  const ar = usePrefs().autoReply;
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-fg">
        <input type="checkbox" checked={ar.enabled} onChange={(e) => setAutoReply({ enabled: e.target.checked })} /> Send automatic replies
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="ar-start" className={label}>From (optional)</label><input id="ar-start" type="date" value={ar.start} onChange={(e) => setAutoReply({ start: e.target.value })} className={field} /></div>
        <div><label htmlFor="ar-end" className={label}>Until (optional)</label><input id="ar-end" type="date" value={ar.end} onChange={(e) => setAutoReply({ end: e.target.value })} className={field} /></div>
      </div>
      <div><label htmlFor="ar-subject" className={label}>Subject</label><input id="ar-subject" value={ar.subject} onChange={(e) => setAutoReply({ subject: e.target.value })} className={field} /></div>
      <div><label htmlFor="ar-message" className={label}>Message</label><textarea id="ar-message" rows={4} value={ar.message} onChange={(e) => setAutoReply({ message: e.target.value })} className={field} /></div>
      <Note>
        Automatic replies go only to people on Typhoonpost, and only while Typhoonpost is open in a browser, because the server cannot read your mail to answer it.
        Each person gets one every few days at most. Replies to machines, newsletters and other automatic replies are skipped.
      </Note>
    </div>
  );
}

const ACTION_TYPES = Object.keys(ACTION_LABELS) as QuickAction['type'][];

function blankAction(type: QuickAction['type']): QuickAction {
  if (type === 'move') return { type, folder: 'archive' };
  if (type === 'category') return { type, label: 'work' };
  return { type } as QuickAction;
}

function QuickStepsTab() {
  const prefs = usePrefs();
  const cats = categoryDefs(prefs);
  const folders = folderTree(prefs);
  const patch = (q: QuickStep, actions: QuickAction[]) => saveQuickStep({ ...q, actions });
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-fg-subtle">A quick step does several things to a message in one click, from Quick steps in the toolbar. They run in this browser on the messages you have selected.</p>
      {prefs.quickSteps.map((q) => (
        <div key={q.id} className="rounded-lg border border-line p-3" data-testid="quick-step">
          <div className="flex items-center gap-2">
            <input aria-label="Quick step name" className={field} value={q.name} onChange={(e) => saveQuickStep({ ...q, name: e.target.value })} />
            <button aria-label={`Delete ${q.name}`} onClick={() => removeQuickStep(q.id)} className="rounded p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {q.actions.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <select aria-label="Action" className={field} value={a.type} onChange={(e) => patch(q, q.actions.map((x, j) => (j === i ? blankAction(e.target.value as QuickAction['type']) : x)))}>
                  {ACTION_TYPES.map((t) => <option key={t} value={t}>{ACTION_LABELS[t]}</option>)}
                </select>
                {a.type === 'move' && (
                  <select aria-label="Folder" className={field} value={a.folder} onChange={(e) => patch(q, q.actions.map((x, j) => (j === i ? { type: 'move', folder: e.target.value as never } : x)))}>
                    <option value="inbox">Inbox</option>
                    <option value="archive">Archive</option>
                    <option value="spam">Junk</option>
                    {folders.map(({ folder }) => <option key={folder.id} value={`f:${folder.id}`}>{folder.name}</option>)}
                  </select>
                )}
                {a.type === 'category' && (
                  <select aria-label="Category" className={field} value={a.label} onChange={(e) => patch(q, q.actions.map((x, j) => (j === i ? { type: 'category', label: e.target.value } : x)))}>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                <button aria-label="Remove action" onClick={() => patch(q, q.actions.filter((_, j) => j !== i))} className="rounded p-1.5 text-fg-subtle hover:text-danger"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <button onClick={() => patch(q, [...q.actions, blankAction('markRead')])} className="mt-2 flex items-center gap-1 text-sm text-accent"><Plus className="h-3.5 w-3.5" />Add an action</button>
        </div>
      ))}
      <button onClick={() => saveQuickStep({ id: newId(), name: 'New quick step', actions: [{ type: 'markRead' }] })} className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"><Plus className="h-4 w-4" />New quick step</button>
    </div>
  );
}

function TemplatesTab() {
  const prefs = usePrefs();
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-fg-subtle">Templates are text you reuse. Save one from the Templates button in a new message. They are encrypted like the rest of your settings.</p>
      {prefs.templates.length === 0 && <p className="text-sm text-fg-muted">No templates yet.</p>}
      {prefs.templates.map((t) => (
        <div key={t.id} className="rounded-lg border border-line p-3" data-testid="template">
          <div className="flex items-center gap-2">
            <input aria-label="Template name" className={field} value={t.name} onChange={(e) => saveTemplate({ ...t, name: e.target.value })} />
            <button aria-label={`Delete ${t.name}`} onClick={() => removeTemplate(t.id)} className="rounded p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
          <input aria-label="Template subject" placeholder="Subject (optional)" className={`${field} mt-2`} value={t.subject} onChange={(e) => saveTemplate({ ...t, subject: e.target.value })} />
        </div>
      ))}
    </div>
  );
}
