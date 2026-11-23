import { AnimatePresence, motion } from 'framer-motion';
import { Flag, X } from 'lucide-react';
import { useState } from 'react';
import { followUpDay, ymd, type FollowUpOption } from '@/lib/followup';

interface FollowUpMenuProps {
  open: boolean;
  onClose: () => void;
  /** A day as YYYY-MM-DD, or null to clear the flag. */
  onPick: (day: string | null) => void;
  hasFlag: boolean;
}

const OPTIONS: { id: FollowUpOption; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'this-week', label: 'This week' },
  { id: 'next-week', label: 'Next week' },
];

function describe(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function FollowUpMenu({ open, onClose, onPick, hasFlag }: FollowUpMenuProps) {
  const [custom, setCustom] = useState(ymd(new Date()));
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute z-50 mt-1 w-60 overflow-hidden rounded-xl border border-line-strong bg-bg-subtle shadow-pop"
            role="menu"
            aria-label="Follow up"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Follow up</span>
              <button onClick={onClose} className="text-fg-subtle hover:text-fg" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {OPTIONS.map((o) => {
              const day = followUpDay(o.id);
              return (
                <button
                  key={o.id}
                  role="menuitem"
                  onClick={() => {
                    onPick(day);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-muted"
                >
                  <Flag className="h-4 w-4 text-warning" />
                  <div>
                    <p className="text-sm font-medium text-fg">{o.label}</p>
                    <p className="text-2xs text-fg-subtle">{describe(day)}</p>
                  </div>
                </button>
              );
            })}
            <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
              <input
                type="date"
                value={custom}
                min={ymd(new Date())}
                onChange={(e) => setCustom(e.target.value)}
                aria-label="Custom follow-up date"
                className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-xs text-fg"
              />
              <button
                disabled={!custom}
                onClick={() => {
                  onPick(custom);
                  onClose();
                }}
                className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg disabled:opacity-40"
              >
                Set
              </button>
            </div>
            {hasFlag && (
              <button
                role="menuitem"
                onClick={() => {
                  onPick(null);
                  onClose();
                }}
                className="w-full border-t border-line px-3 py-2.5 text-left text-sm text-fg hover:bg-bg-muted"
              >
                Clear follow-up
              </button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
