import { AnimatePresence, motion } from 'framer-motion';
import { X, PenLine, LogOut } from 'lucide-react';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  signature: string;
  onSignatureChange: (s: string) => void;
  accountEmail?: string;
  onSignOut?: () => void;
}

export function SettingsModal({
  open,
  onClose,
  signature,
  onSignatureChange,
  accountEmail,
  onSignOut,
}: SettingsModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-line-strong bg-bg-subtle shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-line bg-bg-muted px-4 py-3">
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-accent" />
                <span className="text-sm font-semibold text-fg">Settings</span>
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                Email signature
              </label>
              <p className="mb-2 text-2xs text-fg-subtle">
                Appended to the bottom of emails you compose.
              </p>
              <textarea
                value={signature}
                onChange={(e) => onSignatureChange(e.target.value)}
                placeholder="e.g. Alex Rivera · Product Engineer · Quill"
                rows={4}
                className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent scrollbar-thin"
              />
            </div>
            {onSignOut && (
              <div className="border-t border-line px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-2xs text-fg-subtle">Signed in as</span>
                  <span className="text-xs font-medium text-fg">{accountEmail}</span>
                </div>
                <button
                  onClick={onSignOut}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-danger"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            )}
            <div className="flex justify-end border-t border-line px-4 py-3">
              <button
                onClick={onClose}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-soft transition-all hover:brightness-105 active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
