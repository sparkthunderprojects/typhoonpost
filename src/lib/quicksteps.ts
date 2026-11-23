import type { FolderId } from '@/types';

export type QuickAction =
  | { type: 'move'; folder: FolderId }
  | { type: 'archive' }
  | { type: 'delete' }
  | { type: 'markRead' }
  | { type: 'markUnread' }
  | { type: 'flag' }
  | { type: 'unflag' }
  | { type: 'category'; label: string }
  | { type: 'task' };

export interface QuickStep {
  id: string;
  name: string;
  actions: QuickAction[];
}

export const DEFAULT_QUICK_STEPS: QuickStep[] = [
  { id: 'qs-archive-read', name: 'Archive and mark read', actions: [{ type: 'markRead' }, { type: 'archive' }] },
  { id: 'qs-follow', name: 'Flag and make a task', actions: [{ type: 'flag' }, { type: 'task' }] },
];

export const ACTION_LABELS: Record<QuickAction['type'], string> = {
  move: 'Move to folder',
  archive: 'Archive',
  delete: 'Delete',
  markRead: 'Mark as read',
  markUnread: 'Mark as unread',
  flag: 'Flag',
  unflag: 'Clear flag',
  category: 'Add category',
  task: 'Create a task',
};

/** Steps that move the message away have to run after the ones that change it in place. */
export function ordered(actions: QuickAction[]): QuickAction[] {
  const leaves = (a: QuickAction) => a.type === 'move' || a.type === 'archive' || a.type === 'delete';
  const stay = actions.filter((a) => !leaves(a));
  const go = actions.filter(leaves);
  return [...stay, ...go.slice(-1)]; // a message can only go to one place: the last choice wins
}

const DAY = 86_400_000;
/**
 * Which Deleted Items to remove for good. Days are counted from when this browser first saw the
 * message there, so mail that was received long ago is never removed the moment it is deleted.
 */
export function planAutoEmpty(trashIds: string[], stamps: Record<string, string>, days: number, now = Date.now()) {
  const next: Record<string, string> = {};
  const remove: string[] = [];
  for (const id of trashIds) {
    const seen = stamps[id] ? new Date(stamps[id]).getTime() : NaN;
    if (Number.isNaN(seen)) { next[id] = new Date(now).toISOString(); continue; }
    if (days > 0 && now - seen >= days * DAY) remove.push(id);
    else next[id] = stamps[id];
  }
  return { next, remove };
}
