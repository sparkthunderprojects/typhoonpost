import { useRef, useState } from 'react';
import { Check, Download, Globe, RefreshCw, Upload, X } from 'lucide-react';
import { EVENT_COLORS } from '@/types';
import { addSubscription, editSubscription, removeSubscription, usePrefs } from '@/lib/prefs';

export type SourceStatus = 'loading' | 'ok' | { error: string };

interface Props {
  onImport: (file: File) => void;
  onExport: () => void;
  onRefresh: () => void;
  status: Record<string, SourceStatus>;
  /** What the last import did, for a short confirmation. */
  importResult?: string;
}

export function CalendarSources({ onImport, onExport, onRefresh, status, importResult }: Props) {
  const prefs = usePrefs();
  const file = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const add = () => {
    if (!/^(https?|webcal):\/\//i.test(url.trim())) return;
    addSubscription(name, url, EVENT_COLORS[(prefs.subscriptions.length + 3) % EVENT_COLORS.length]);
    setName('');
    setUrl('');
    setAdding(false);
  };

  return (
    <section aria-label="Other calendars">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Other calendars</h2>
        {prefs.subscriptions.length > 0 && (
          <button onClick={onRefresh} aria-label="Refresh internet calendars" className="rounded p-0.5 text-fg-subtle hover:bg-bg-muted hover:text-fg">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {prefs.subscriptions.map((s) => {
          const st = status[s.id];
          return (
            <li key={s.id} className="group rounded px-1 py-1 hover:bg-bg-muted">
              <div className="flex items-center gap-2">
                <button
                  role="checkbox"
                  aria-checked={s.visible}
                  aria-label={`Show ${s.name}`}
                  onClick={() => editSubscription(s.id, { visible: !s.visible })}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  style={{ borderColor: s.color, backgroundColor: s.visible ? s.color : 'transparent' }}
                >
                  {s.visible && <Check className="h-3 w-3 text-white" />}
                </button>
                <Globe className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{s.name}</span>
                <button onClick={() => removeSubscription(s.id)} aria-label={`Remove ${s.name}`} className="hidden text-fg-subtle hover:text-danger group-hover:block">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {st && st !== 'ok' && (
                <p className={`ml-6 text-2xs ${st === 'loading' ? 'text-fg-subtle' : 'text-danger'}`} role="status">
                  {st === 'loading' ? 'Loading…' : st.error}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-1.5 space-y-1.5">
          <input aria-label="Calendar name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="w-full rounded-md border border-line bg-bg px-2 py-1 text-sm" />
          <input
            aria-label="Calendar address"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="https:// address of an .ics feed"
            className="w-full rounded-md border border-line bg-bg px-2 py-1 text-sm"
          />
          <div className="flex gap-1.5">
            <button onClick={add} disabled={!/^(https?|webcal):\/\//i.test(url.trim())} className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg disabled:opacity-50">Subscribe</button>
            <button onClick={() => setAdding(false)} className="rounded-md px-2.5 py-1 text-xs text-fg-muted hover:bg-bg-muted">Cancel</button>
          </div>
          <p className="text-2xs text-fg-subtle">Only the feed’s public address goes through our server. Your own events never do.</p>
        </div>
      ) : (
        <div className="mt-1 flex flex-col items-start gap-0.5 text-xs">
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded px-1 py-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
            <Globe className="h-3.5 w-3.5" /> Subscribe from internet
          </button>
          <button onClick={() => file.current?.click()} className="flex items-center gap-1.5 rounded px-1 py-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
            <Upload className="h-3.5 w-3.5" /> Import .ics file
          </button>
          <button onClick={onExport} className="flex items-center gap-1.5 rounded px-1 py-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
            <Download className="h-3.5 w-3.5" /> Export calendar
          </button>
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept=".ics,text/calendar"
        aria-label="Import calendar file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = '';
        }}
      />
      {importResult && <p className="mt-1 text-2xs text-fg-muted" role="status">{importResult}</p>}
    </section>
  );
}
