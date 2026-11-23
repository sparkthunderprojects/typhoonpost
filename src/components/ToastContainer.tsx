import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import type { ToastItem } from '@/types';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line-strong bg-bg-subtle px-4 py-2.5 shadow-pop"
          >
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm font-medium text-fg">{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button
                onClick={() => {
                  t.onAction?.();
                  onDismiss(t.id);
                }}
                className="ml-1 rounded-md px-2 py-0.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              onClick={() => onDismiss(t.id)}
              className="ml-1 rounded-md p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
