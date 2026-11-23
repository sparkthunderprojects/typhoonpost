import { Check, Eye, MoreHorizontal, Settings2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { setConversations, setDensity, setReadingPane, usePrefs, type Density, type ReadingPane } from '@/lib/prefs';

function Panel({ children, onClose, label, right }: { children: ReactNode; onClose: () => void; label: string; right?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="menu"
        aria-label={label}
        className={`absolute z-50 mt-1 w-60 overflow-hidden rounded-lg border border-line-strong bg-bg-subtle py-1 shadow-pop ${right ? 'right-0' : 'left-0'}`}
      >
        {children}
      </div>
    </>
  );
}

function Item({ label, checked, onClick, disabled }: { label: string; checked?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-fg hover:bg-bg-muted disabled:opacity-40"
    >
      {label}
      {checked && <Check className="h-4 w-4 text-accent" />}
    </button>
  );
}

const Heading = ({ children }: { children: ReactNode }) => (
  <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{children}</p>
);

const PANES: { id: ReadingPane; label: string }[] = [
  { id: 'right', label: 'Right' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'off', label: 'Off' },
];
const DENSITIES: { id: Density; label: string }[] = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
];

/** Layout choices. They are saved with your encrypted settings and follow you between devices. */
export function ViewMenu() {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        title="View"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded px-2.5 text-[13px] text-fg hover:bg-bg-muted"
      >
        <Eye className="h-4 w-4 text-accent" />
        <span className="hidden min-[1380px]:inline">View</span>
      </button>
      {open && (
        <Panel onClose={() => setOpen(false)} label="View" right>
          <Heading>Reading pane</Heading>
          {PANES.map((o) => (
            <Item key={o.id} label={o.label} checked={prefs.readingPane === o.id} onClick={() => setReadingPane(o.id)} />
          ))}
          <Heading>Message list</Heading>
          {DENSITIES.map((o) => (
            <Item key={o.id} label={o.label} checked={prefs.density === o.id} onClick={() => setDensity(o.id)} />
          ))}
          <div className="my-1 border-t border-line" />
          <Item label="Group into conversations" checked={prefs.conversations} onClick={() => setConversations(!prefs.conversations)} />
        </Panel>
      )}
    </div>
  );
}

export interface MoreMenuProps {
  hasEmail: boolean;
  ignored: boolean;
  focus: 'focused' | 'other' | null;
  /** True when the open message is currently sorted into Focused. */
  inFocused: boolean;
  onPrint: () => void;
  onSaveAs: () => void;
  onIgnore: () => void;
  onSenderFocus: (choice: 'focused' | 'other' | null) => void;
  senderBlocked: boolean;
  senderSafe: boolean;
  onBlock: () => void;
  onSafe: () => void;
  onSweep: (kind: 'archive' | 'delete') => void;
  onCleanUp: () => void;
}

export function MoreMenu({
  hasEmail, ignored, focus, inFocused, onPrint, onSaveAs, onIgnore, onSenderFocus,
  senderBlocked, senderSafe, onBlock, onSafe, onSweep, onCleanUp,
}: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!hasEmail}
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center rounded px-2 text-fg hover:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MoreHorizontal className="h-4 w-4 text-accent" />
      </button>
      {open && (
        <Panel onClose={() => setOpen(false)} label="More actions">
          <Item label="Print" onClick={run(onPrint)} />
          <Item label="Save as file (.eml)" onClick={run(onSaveAs)} />
          <div className="my-1 border-t border-line" />
          <Item label={ignored ? 'Stop ignoring conversation' : 'Ignore conversation'} onClick={run(onIgnore)} />
          <div className="my-1 border-t border-line" />
          {inFocused ? (
            <Item label="Always move this sender to Other" onClick={run(() => onSenderFocus('other'))} />
          ) : (
            <Item label="Always move this sender to Focused" onClick={run(() => onSenderFocus('focused'))} />
          )}
          {focus && <Item label="Go back to automatic sorting" onClick={run(() => onSenderFocus(null))} />}
          <div className="my-1 border-t border-line" />
          <Item label="Clean up conversation (keep the newest)" onClick={run(onCleanUp)} />
          <Item label="Sweep: archive all from this sender" onClick={run(() => onSweep('archive'))} />
          <Item label="Sweep: delete all from this sender, and future mail" onClick={run(() => onSweep('delete'))} />
          <div className="my-1 border-t border-line" />
          {!senderBlocked && <Item label="Block sender" onClick={run(onBlock)} />}
          {!senderSafe && <Item label={senderBlocked ? 'Unblock and mark as safe' : 'Mark sender as safe'} onClick={run(onSafe)} />}
        </Panel>
      )}
    </div>
  );
}

export function MailSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Mail settings: undo send, rules, blocked senders, automatic replies"
      aria-label="Mail settings"
      className="flex h-8 items-center gap-1.5 rounded px-2.5 text-[13px] text-fg hover:bg-bg-muted"
    >
      <Settings2 className="h-4 w-4 text-accent" />
    </button>
  );
}
