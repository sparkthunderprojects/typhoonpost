import { CalendarCheck, CalendarX, Check, HelpCircle, X } from 'lucide-react';
import type { CalendarEvent, InvitePayload, RsvpStatus } from '@/types';
import { describeWhen, summariseResponses } from '@/lib/invites';
import { describeRepeat } from '@/lib/calendar';

interface InviteCardProps {
  invite: InvitePayload;
  myAddress: string;
  /** The copy already on your calendar, if any. */
  existing?: CalendarEvent;
  onRespond: (status: RsvpStatus) => void;
  onRemove: () => void;
}

const LABEL: Record<RsvpStatus, string> = { accepted: 'Accept', tentative: 'Tentative', declined: 'Decline', needs: '' };
const ICON = { accepted: Check, tentative: HelpCircle, declined: X } as const;

export function InviteCard({ invite, myAddress, existing, onRespond, onRemove }: InviteCardProps) {
  const e = invite.event;
  const mine = invite.organizer.email.toLowerCase() === myAddress.toLowerCase();
  const answered = existing?.myStatus;
  return (
    <div className="mb-4 rounded-xl border border-line-strong bg-bg p-4" data-testid="invite-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-accent/10 p-2 text-accent">
          {invite.method === 'CANCEL' ? <CalendarX className="h-5 w-5" /> : <CalendarCheck className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-fg-subtle">
            {invite.method === 'CANCEL' ? 'Meeting canceled' : invite.method === 'REPLY' ? 'Meeting response' : invite.sequence > 0 ? 'Updated invitation' : 'Meeting invitation'}
          </p>
          <h2 className="truncate text-base font-semibold text-fg">{e.title || '(No title)'}</h2>
          <p className="text-sm text-fg-muted">{describeWhen(e)}</p>
          {e.repeat && <p className="text-xs text-fg-subtle">{describeRepeat(e.repeat)}</p>}
          {e.location && <p className="text-sm text-fg-muted">{e.location}</p>}
          {e.meetingUrl && /^https?:\/\//i.test(e.meetingUrl) && (
            <a href={e.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline">Join the meeting</a>
          )}
          {invite.method !== 'REPLY' && <p className="mt-1 text-xs text-fg-subtle">Organised by {invite.organizer.name || invite.organizer.email}</p>}
        </div>
      </div>

      {invite.method === 'REPLY' && invite.response && (
        <p className="mt-3 text-sm text-fg" role="status">
          {invite.response.name || invite.response.email} responded <strong>{invite.response.status}</strong>.
        </p>
      )}

      {invite.method === 'REQUEST' && mine && (
        <p className="mt-3 text-sm text-fg-muted">
          You sent this invitation. {existing?.attendees ? summariseResponses(existing.attendees) : ''}
        </p>
      )}

      {invite.method === 'REQUEST' && !mine && (
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Respond to invitation">
          {(['accepted', 'tentative', 'declined'] as const).map((s) => {
            const Icon = ICON[s];
            const on = answered === s;
            return (
              <button
                key={s}
                aria-pressed={on}
                onClick={() => onRespond(s)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${on ? 'border-accent bg-accent/10 text-accent' : 'border-line text-fg hover:bg-bg-muted'}`}
              >
                <Icon className="h-4 w-4" /> {LABEL[s]}
              </button>
            );
          })}
          {answered && <span className="text-xs text-fg-subtle">You answered: {answered}</span>}
        </div>
      )}

      {invite.method === 'CANCEL' && (
        existing ? (
          <button onClick={onRemove} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted">
            Remove from calendar
          </button>
        ) : (
          <p className="mt-3 text-sm text-fg-muted">This meeting is no longer on your calendar.</p>
        )
      )}
    </div>
  );
}
