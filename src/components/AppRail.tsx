import { Mail, CalendarDays, Users } from 'lucide-react';
import type { AppView } from '@/types';

interface AppRailProps {
  view: AppView;
  onViewChange: (v: AppView) => void;
  unreadCount: number;
}

const items: { id: AppView; label: string; Icon: typeof Mail }[] = [
  { id: 'mail', label: 'Mail', Icon: Mail },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'contacts', label: 'People', Icon: Users },
];

export function AppRail({ view, onViewChange, unreadCount }: AppRailProps) {
  return (
    <nav
      aria-label="Apps"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-bg py-2"
    >
      {items.map(({ id, label, Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            title={label}
            aria-current={active ? 'page' : undefined}
            className={`relative flex w-12 flex-col items-center gap-0.5 rounded py-2 text-[10px] font-medium transition-colors ${
              active ? 'bg-bg-subtle text-accent shadow-soft' : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
            }`}
          >
            {active && <span className="absolute left-0 top-2 h-6 w-[3px] rounded-r bg-accent" />}
            <Icon className="h-5 w-5" />
            {label}
            {id === 'mail' && unreadCount > 0 && (
              <span className="absolute right-1 top-0.5 min-w-[16px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-accent-fg">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
