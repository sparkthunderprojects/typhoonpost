import { AnimatePresence, motion } from 'framer-motion';
import { Check, Tag, X } from 'lucide-react';
import type { LabelId } from '@/types';
import { categoryDefs, usePrefs } from '@/lib/prefs';

interface LabelPickerProps {
  open: boolean;
  onClose: () => void;
  current: LabelId[];
  onToggle: (label: LabelId) => void;
}

export function LabelPicker({ open, onClose, current, onToggle }: LabelPickerProps) {
  const prefs = usePrefs();
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
            className="absolute z-50 mt-1 w-52 overflow-hidden rounded-xl border border-line-strong bg-bg-subtle shadow-pop"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                <Tag className="h-3 w-3" /> Labels
              </span>
              <button onClick={onClose} className="text-fg-subtle hover:text-fg">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {categoryDefs(prefs).map((l) => {
              const active = current.includes(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => onToggle(l.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-bg-muted"
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="flex-1 text-sm font-medium text-fg">{l.name}</span>
                  {active && <Check className="h-4 w-4 text-accent" />}
                </button>
              );
            })}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
