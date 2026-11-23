import { X } from 'lucide-react';
import type { CalendarEvent } from '@/types';
import { describeWhen } from '@/lib/invites';
import { describeRepeat } from '@/lib/calendar';

/** Read-only view of an event from an internet calendar. */
export function EventDetails({ event, onClose, calendarName }: { event: CalendarEvent | null; onClose: () => void; calendarName?: string }) {
  if (!event) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-label="Event details" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-line-strong bg-bg-subtle p-5 shadow-pop">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-fg-subtle">{calendarName ?? 'Internet calendar'} · read-only</p>
            <h2 className="text-lg font-semibold text-fg">{event.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-fg-subtle hover:bg-bg-muted hover:text-fg"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-fg">{describeWhen(event)}</p>
        {event.repeat && <p className="text-xs text-fg-subtle">{describeRepeat(event.repeat)}</p>}
        {event.location && <p className="mt-2 text-sm text-fg-muted">{event.location}</p>}
        {event.description && <p className="mt-3 whitespace-pre-wrap text-sm text-fg-muted">{event.description}</p>}
      </div>
    </div>
  );
}
