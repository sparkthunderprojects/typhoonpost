import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, CornerDownLeft } from 'lucide-react';

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  Icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const run = (cmd: PaletteCommand | undefined) => {
    if (!cmd) return;
    onClose();
    // Let the palette close before the action (e.g. opening a modal) runs.
    setTimeout(cmd.run, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/35 px-4 pt-[14vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-line-strong bg-bg-subtle shadow-pop"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 text-fg-subtle" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type a command or jump to a folder…"
                aria-label="Search commands"
                className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
              />
              <kbd className="rounded border border-line-strong px-1.5 py-0.5 text-2xs text-fg-subtle">Esc</kbd>
            </div>

            <div ref={listRef} className="max-h-[340px] overflow-y-auto py-1.5 scrollbar-thin">
              {results.length === 0 && <p className="px-4 py-8 text-center text-sm text-fg-subtle">No matching commands</p>}
              {results.map((cmd, i) => {
                const showGroup = cmd.group !== lastGroup;
                lastGroup = cmd.group;
                const active = i === index;
                return (
                  <div key={cmd.id}>
                    {showGroup && (
                      <div className="px-4 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                        {cmd.group}
                      </div>
                    )}
                    <button
                      data-idx={i}
                      onMouseMove={() => setIndex(i)}
                      onClick={() => run(cmd)}
                      className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        active ? 'bg-accent-soft text-fg' : 'text-fg'
                      }`}
                    >
                      <cmd.Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : 'text-fg-muted'}`} />
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="rounded border border-line-strong px-1.5 py-0.5 text-2xs text-fg-subtle">{cmd.shortcut}</kbd>
                      )}
                      {active && <CornerDownLeft className="h-3.5 w-3.5 text-fg-subtle" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
