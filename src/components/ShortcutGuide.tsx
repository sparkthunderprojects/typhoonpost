import { AnimatePresence, motion } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

interface ShortcutGuideProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts: { keys: string[]; label: string }[] = [
  { keys: ['J'], label: 'Move down' },
  { keys: ['K'], label: 'Move up' },
  { keys: ['E'], label: 'Archive email' },
  { keys: ['D'], label: 'Delete email' },
  { keys: ['C'], label: 'Compose new' },
  { keys: ['?'], label: 'Show this guide' },
  { keys: ['Esc'], label: 'Close dialogs' },
  { keys: ['⌘', 'Enter'], label: 'Send composed' },
];

export function ShortcutGuide({ open, onClose }: ShortcutGuideProps) {
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
                <Keyboard className="h-4 w-4 text-accent" />
                <span className="text-sm font-semibold text-fg">Keyboard Shortcuts</span>
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              {shortcuts.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-bg-muted"
                >
                  <span className="text-sm text-fg-muted">{s.label}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-[1.5rem] rounded-md border border-line-strong bg-bg px-2 py-1 text-center text-2xs font-semibold text-fg"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
