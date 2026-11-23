import { Search, X, Moon, Sun, Settings, Keyboard, Command } from 'lucide-react';
import { Logo } from '@/components/Logo';

interface TopBarProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  searchDisabled?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenPalette: () => void;
  userEmail: string;
}

export function TopBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchDisabled,
  theme,
  onToggleTheme,
  onOpenSettings,
  onOpenShortcuts,
  onOpenPalette,
  userEmail,
}: TopBarProps) {
  const initial = (userEmail[0] ?? '?').toUpperCase();
  const iconBtn =
    'flex h-8 w-8 items-center justify-center rounded text-white/90 transition-colors hover:bg-white/15 hover:text-white';

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 bg-brand px-3 text-white dark:bg-bg-subtle dark:border-b dark:border-line">
      <div className="flex w-52 shrink-0 items-center gap-2 pl-1">
        <Logo size={26} tile={false} className="text-white" />
        <span className="text-[15px] font-semibold tracking-tight">Typhoonpost</span>
      </div>

      <div className="mx-auto w-full max-w-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/80" />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={searchDisabled}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-8 w-full rounded bg-white/20 py-1 pl-9 pr-8 text-sm text-white placeholder:text-white/80 focus:bg-white focus:text-[#242424] focus:placeholder:text-fg-subtle focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {searchValue && !searchDisabled && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/80 hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button onClick={onOpenPalette} className={iconBtn} title="Command palette (Ctrl+K)">
          <Command className="h-4 w-4" />
        </button>
        <button onClick={onToggleTheme} className={iconBtn} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button onClick={onOpenShortcuts} className={iconBtn} title="Keyboard shortcuts">
          <Keyboard className="h-4 w-4" />
        </button>
        <button onClick={onOpenSettings} className={iconBtn} title="Settings">
          <Settings className="h-4 w-4" />
        </button>
        <button
          onClick={onOpenSettings}
          title={userEmail}
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-xs font-semibold text-white transition-colors hover:bg-white/35"
        >
          {initial}
        </button>
      </div>
    </header>
  );
}
