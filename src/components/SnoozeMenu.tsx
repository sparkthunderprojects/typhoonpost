import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Sun, CalendarDays, CalendarClock, X } from 'lucide-react';

export type SnoozeOption = 'later-today' | 'tomorrow' | 'next-week';

interface SnoozeMenuProps {
  open: boolean;
  onClose: () => void;
  onSnooze: (option: SnoozeOption) => void;
}

const options: { id: SnoozeOption; label: string; desc: string; Icon: typeof Clock }[] = [
  { id: 'later-today', label: 'Later today', desc: '6:00 PM', Icon: Sun },
  { id: 'tomorrow', label: 'Tomorrow', desc: '8:00 AM', Icon: CalendarDays },
  { id: 'next-week', label: 'Next week', desc: 'Mon, 8:00 AM', Icon: CalendarClock },
];

export function SnoozeMenu({ open, onClose, onSnooze }: SnoozeMenuProps) {
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
            className="absolute z-50 mt-1 w-56 overflow-hidden rounded-xl border border-line-strong bg-bg-subtle shadow-pop"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Snooze until
              </span>
              <button onClick={onClose} className="text-fg-subtle hover:text-fg">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {options.map((o) => {
              const Icon = o.Icon;
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    onSnooze(o.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-muted"
                >
                  <Icon className="h-4 w-4 text-fg-muted" />
                  <div>
                    <p className="text-sm font-medium text-fg">{o.label}</p>
                    <p className="text-2xs text-fg-subtle">{o.desc}</p>
                  </div>
                </button>
              );
            })}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
