import { useState } from 'react';
import { Search, X, Moon, Sun, Settings, Keyboard, Command, SlidersHorizontal } from 'lucide-react';
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
  /** Shown on mail: opens the advanced search panel. */
  onSaveSearch?: (query: string) => void;
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
  onSaveSearch,
}: TopBarProps) {
  const [adv, setAdv] = useState(false);
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
          {onSaveSearch && (
            <button
              onClick={() => setAdv((v) => !v)}
              aria-label="Advanced search"
              aria-expanded={adv}
              title="Advanced search"
              className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/80 hover:text-white"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
          {searchValue && !searchDisabled && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/80 hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {adv && onSaveSearch && (
            <AdvancedSearch
              value={searchValue}
              onApply={(q) => { onSearchChange(q); setAdv(false); }}
              onSave={(q) => { onSaveSearch(q); setAdv(false); }}
              onClose={() => setAdv(false)}
            />
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

const quote = (v: string) => (/\s/.test(v) ? `"${v}"` : v);

/** Builds a search from fields. The result is plain search text, so it can also be typed by hand. */
function AdvancedSearch({ value, onApply, onSave, onClose }: { value: string; onApply: (q: string) => void; onSave: (q: string) => void; onClose: () => void }) {
  const [f, setF] = useState({ words: value, from: '', to: '', subject: '', scope: 'folder', attach: false, unread: false, flagged: false, after: '', before: '' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const build = () => {
    const parts: string[] = [];
    if (f.words.trim()) parts.push(f.words.trim());
    if (f.from.trim()) parts.push(`from:${quote(f.from.trim())}`);
    if (f.to.trim()) parts.push(`to:${quote(f.to.trim())}`);
    if (f.subject.trim()) parts.push(`subject:${quote(f.subject.trim())}`);
    if (f.attach) parts.push('has:attachment');
    if (f.unread) parts.push('is:unread');
    if (f.flagged) parts.push('is:flagged');
    if (f.after) parts.push(`after:${f.after}`);
    if (f.before) parts.push(`before:${f.before}`);
    if (f.scope === 'all') parts.push('in:all');
    return parts.join(' ');
  };
  const field = 'h-8 w-full rounded border border-line-strong bg-bg px-2 text-sm text-fg focus:border-accent focus:outline-none';
  const label = 'mb-0.5 block text-xs text-fg-muted';
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div role="dialog" aria-label="Advanced search" data-testid="advanced-search" className="absolute left-0 right-0 top-10 z-50 rounded-lg border border-line-strong bg-bg-subtle p-4 text-fg shadow-pop">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className={label}>Words</label><input aria-label="Search words" className={field} value={f.words} onChange={(e) => set({ words: e.target.value })} /></div>
          <div><label className={label}>From</label><input aria-label="From" className={field} value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
          <div><label className={label}>To</label><input aria-label="To" className={field} value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
          <div className="col-span-2"><label className={label}>Subject</label><input aria-label="Subject" className={field} value={f.subject} onChange={(e) => set({ subject: e.target.value })} /></div>
          <div><label className={label}>Received after</label><input type="date" aria-label="After" className={field} value={f.after} onChange={(e) => set({ after: e.target.value })} /></div>
          <div><label className={label}>Received before</label><input type="date" aria-label="Before" className={field} value={f.before} onChange={(e) => set({ before: e.target.value })} /></div>
          <div className="col-span-2 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.attach} onChange={(e) => set({ attach: e.target.checked })} />Has attachment</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.unread} onChange={(e) => set({ unread: e.target.checked })} />Unread</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.flagged} onChange={(e) => set({ flagged: e.target.checked })} />Flagged</label>
            <select aria-label="Search in" className="ml-auto h-8 rounded border border-line-strong bg-bg px-2 text-sm" value={f.scope} onChange={(e) => set({ scope: e.target.value })}>
              <option value="folder">This folder</option>
              <option value="all">All folders</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={() => { const q = build(); if (q) onSave(q); }} className="rounded px-3 py-1.5 text-sm text-fg hover:bg-bg-muted">Save as search folder</button>
          <button onClick={() => onApply(build())} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">Search</button>
        </div>
      </div>
    </>
  );
}
