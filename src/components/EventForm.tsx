import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CalendarDays, Trash2 } from 'lucide-react';
import type { CalendarEvent } from '@/types';
import { EVENT_COLORS } from '@/types';

interface EventFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (draft: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  onDelete?: (id: string) => void;
  editing: CalendarEvent | null;
  defaultStartISO?: string;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string {
  return new Date(v).toISOString();
}

export function EventForm({ open, onClose, onSave, onDelete, editing, defaultStartISO }: EventFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [color, setColor] = useState(EVENT_COLORS[0]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description);
      setLocation(editing.location);
      setAllDay(editing.allDay);
      setStart(toLocalInputValue(editing.start));
      setEnd(toLocalInputValue(editing.end));
      setColor(editing.color);
    } else {
      const base = defaultStartISO ?? new Date().toISOString();
      const startDate = new Date(base);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      setTitle('');
      setDescription('');
      setLocation('');
      setAllDay(false);
      setStart(toLocalInputValue(startDate.toISOString()));
      setEnd(toLocalInputValue(endDate.toISOString()));
      setColor(EVENT_COLORS[0]);
    }
  }, [open, editing, defaultStartISO]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end) return;
    onSave({
      id: editing?.id,
      title: title.trim() || '(No title)',
      description,
      location,
      allDay,
      start: fromLocalInputValue(start),
      end: fromLocalInputValue(end),
      color,
    });
    onClose();
  };

  return (
    <AnimatePresence>
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
              <CalendarDays className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-fg">
                {editing ? 'Edit event' : 'New event'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-3 overflow-y-auto p-4 scrollbar-thin">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm font-medium outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />

            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-line"
              />
              All day
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                  Starts
                </label>
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  required
                  value={allDay ? start.slice(0, 10) : start}
                  onChange={(e) => setStart(allDay ? `${e.target.value}T00:00` : e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                  Ends
                </label>
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  required
                  value={allDay ? end.slice(0, 10) : end}
                  onChange={(e) => setEnd(allDay ? `${e.target.value}T23:59` : e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent scrollbar-thin"
            />

            <div>
              <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Color
              </label>
              <div className="flex gap-2">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-offset-2 ring-offset-bg-subtle' : ''}`}
                    style={{ backgroundColor: c, ...(color === c ? { boxShadow: `0 0 0 2px ${c}` } : {}) }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-3">
              {editing && onDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(editing.id);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-soft transition-all hover:brightness-105 active:scale-[0.98]"
              >
                {editing ? 'Save changes' : 'Create event'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
