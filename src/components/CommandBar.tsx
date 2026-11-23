import { useState, type ReactNode } from 'react';
import {
  Mail,
  Trash2,
  Archive,
  FolderInput,
  Reply,
  ReplyAll,
  Forward,
  MailOpen,
  Flag,
  Clock,
  Tag,
  ChevronDown,
  Inbox,
  ShieldAlert,
} from 'lucide-react';
import type { Email, FolderId, LabelId } from '@/types';
import { FOLDER_NAMES } from '@/types';
import { folderTree, usePrefs } from '@/lib/prefs';
import { SnoozeMenu, type SnoozeOption } from '@/components/SnoozeMenu';
import { LabelPicker } from '@/components/LabelPicker';

interface CommandBarProps {
  email: Email | null;
  selectionCount: number;
  onNewMail: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onMove: (folder: FolderId) => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onToggleRead: () => void;
  onToggleFlag: () => void;
  onSnooze: (opt: SnoozeOption) => void;
  onToggleLabel: (label: LabelId) => void;
}

const MOVE_TARGETS: { id: keyof typeof FOLDER_NAMES; Icon: typeof Inbox }[] = [
  { id: 'inbox', Icon: Inbox },
  { id: 'archive', Icon: Archive },
  { id: 'spam', Icon: ShieldAlert },
  { id: 'trash', Icon: Trash2 },
];

function Btn({
  onClick,
  Icon,
  label,
  disabled,
  danger,
  active,
  chevron,
}: {
  onClick: () => void;
  Icon: typeof Mail;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded px-2.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'hover:bg-danger/10 hover:text-danger' : 'hover:bg-bg-muted'
      } ${active ? 'text-danger' : 'text-fg'}`}
    >
      <Icon className={`h-4 w-4 ${danger ? 'text-danger' : active ? '' : 'text-accent'}`} />
      <span className="hidden whitespace-nowrap min-[1380px]:inline">{label}</span>
      {chevron && <ChevronDown className="h-3 w-3 text-fg-subtle" />}
    </button>
  );
}

function Sep() {
  return <div className="mx-1 h-5 w-px bg-line-strong" />;
}

function Menu({ children }: { children: ReactNode }) {
  return <div className="relative">{children}</div>;
}

export function CommandBar({
  email,
  selectionCount,
  onNewMail,
  onDelete,
  onArchive,
  onMove,
  onReply,
  onReplyAll,
  onForward,
  onToggleRead,
  onToggleFlag,
  onSnooze,
  onToggleLabel,
}: CommandBarProps) {
  const prefs = usePrefs();
  const [moveOpen, setMoveOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

  const hasTarget = Boolean(email) || selectionCount > 0;
  const hasEmail = Boolean(email);

  return (
    <div
      role="toolbar"
      aria-label="Mail actions"
      className="relative z-30 flex h-11 shrink-0 items-center gap-0.5 border-b border-line bg-bg-subtle px-2"
    >
      <button
        onClick={onNewMail}
        className="mr-1 flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded bg-accent px-3 text-[13px] font-semibold text-accent-fg transition-all hover:brightness-110"
      >
        <Mail className="h-4 w-4" />
        New mail
      </button>
      <Sep />
      <Btn onClick={onDelete} Icon={Trash2} label="Delete" disabled={!hasTarget} danger />
      <Btn onClick={onArchive} Icon={Archive} label="Archive" disabled={!hasTarget} />
      <Menu>
        <Btn onClick={() => setMoveOpen((v) => !v)} Icon={FolderInput} label="Move to" disabled={!hasEmail} chevron />
        {moveOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMoveOpen(false)} />
            <div className="absolute left-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border border-line-strong bg-bg-subtle py-1 shadow-pop">
              {MOVE_TARGETS.map(({ id, Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    onMove(id);
                    setMoveOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-fg hover:bg-bg-muted"
                >
                  <Icon className="h-4 w-4 text-fg-muted" />
                  {FOLDER_NAMES[id]}
                </button>
              ))}
              {folderTree(prefs).length > 0 && <div className="my-1 border-t border-line" />}
              {folderTree(prefs).map(({ folder, depth }) => (
                <button
                  key={folder.id}
                  onClick={() => { onMove(`f:${folder.id}`); setMoveOpen(false); }}
                  style={{ paddingLeft: 12 + depth * 12 }}
                  className="flex w-full items-center gap-2.5 py-2 pr-3 text-left text-sm text-fg hover:bg-bg-muted"
                >
                  <FolderInput className="h-4 w-4" style={{ color: folder.color }} />
                  {folder.name}
                </button>
              ))}
            </div>
          </>
        )}
      </Menu>
      <Sep />
      <Btn onClick={onReply} Icon={Reply} label="Reply" disabled={!hasEmail} />
      <Btn onClick={onReplyAll} Icon={ReplyAll} label="Reply all" disabled={!hasEmail} />
      <Btn onClick={onForward} Icon={Forward} label="Forward" disabled={!hasEmail} />
      <Sep />
      <Btn
        onClick={onToggleRead}
        Icon={email?.read === false ? MailOpen : Mail}
        label={email?.read === false ? 'Mark as read' : 'Mark as unread'}
        disabled={!hasEmail}
      />
      <Btn onClick={onToggleFlag} Icon={Flag} label={email?.starred ? 'Unflag' : 'Flag'} disabled={!hasEmail} active={email?.starred} />
      <Menu>
        <Btn onClick={() => setSnoozeOpen((v) => !v)} Icon={Clock} label="Snooze" disabled={!hasEmail} chevron />
        <SnoozeMenu open={snoozeOpen} onClose={() => setSnoozeOpen(false)} onSnooze={onSnooze} />
      </Menu>
      <Menu>
        <Btn onClick={() => setLabelOpen((v) => !v)} Icon={Tag} label="Categorize" disabled={!hasEmail} chevron />
        <LabelPicker
          open={labelOpen}
          onClose={() => setLabelOpen(false)}
          current={email?.labels ?? []}
          onToggle={onToggleLabel}
        />
      </Menu>
    </div>
  );
}
