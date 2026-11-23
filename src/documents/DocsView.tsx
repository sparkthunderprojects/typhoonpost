import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, FilePlus2, FileText, Loader2, RotateCcw, Star, Trash2 } from 'lucide-react';
import { DocEditor } from './DocEditor';
import { createDocument, deleteDocumentForever, duplicateDocument, listDocuments, setStarred, setTrashed } from './store';
import type { DocSummary } from './types';

type Filter = 'all' | 'starred' | 'trash';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All documents' },
  { id: 'starred', label: 'Starred' },
  { id: 'trash', label: 'Trash' },
];

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

export default function DocsView({ userId, query }: { userId: string; query: string }) {
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setDocs(await listDocuments()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your documents.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const upsert = useCallback((s: DocSummary) => {
    setDocs((cur) => (cur ? [s, ...cur.filter((d) => d.id !== s.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : cur));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs ?? [])
      .filter((d) => (filter === 'trash' ? !!d.trashedAt : !d.trashedAt && (filter !== 'starred' || d.starred)))
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.excerpt.toLowerCase().includes(q));
  }, [docs, filter, query]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true);
    try { const s = await createDocument(userId, 'Untitled document'); upsert(s); setOpenId(s.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create a document.'); }
    finally { setBusy(false); }
  };

  if (openId) {
    return <DocEditor key={openId} id={openId} userId={userId} onSaved={upsert} onClose={() => { setOpenId(null); load(); }} />;
  }

  return (
    <div className="flex min-w-0 flex-1">
      <nav aria-label="Document filters" className="hidden w-52 shrink-0 flex-col gap-1 border-r border-line bg-bg-subtle p-3 md:flex">
        <button onClick={create} disabled={busy} className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-60">
          <FilePlus2 className="h-4 w-4" />New document
        </button>
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} aria-current={filter === f.id ? 'page' : undefined}
            className={`rounded px-3 py-1.5 text-left text-sm ${filter === f.id ? 'bg-bg-muted font-medium text-accent' : 'text-fg-muted hover:bg-bg-muted hover:text-fg'}`}>
            {f.label}
          </button>
        ))}
      </nav>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-3 md:hidden">
          <select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="rounded border border-line bg-bg px-2 py-1 text-sm">
            {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <button onClick={create} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">New document</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <h1 className="mb-4 text-lg font-semibold">{FILTERS.find((f) => f.id === filter)!.label}</h1>
          {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
          {docs === null && !error ? (
            <div className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" />Opening your documents…</div>
          ) : visible.length === 0 ? (
            <div className="mx-auto mt-16 max-w-sm text-center text-sm text-fg-muted">
              <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
              {filter === 'trash' ? <p>Trash is empty.</p> : filter === 'starred' ? <p>Star a document to keep it here.</p> : query ? <p>No documents match your search.</p> : (
                <>
                  <p className="mb-3">Write letters, reports and notes here. Everything you write is encrypted on this device before it is saved.</p>
                  <button onClick={create} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg">Create a document</button>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-bg">
              {visible.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-subtle">
                  <FileText className="h-5 w-5 shrink-0 text-accent" />
                  <button
                    onClick={() => (d.trashedAt ? undefined : setOpenId(d.id))}
                    disabled={!!d.trashedAt || d.undecryptable}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="truncate text-xs text-fg-muted">{d.excerpt || 'Empty document'}</p>
                  </button>
                  <span className="hidden shrink-0 text-xs text-fg-muted sm:block">{d.words.toLocaleString()} words · {when(d.updatedAt)}</span>
                  {d.trashedAt ? (
                    <>
                      <IconBtn label="Restore" onClick={() => act(() => setTrashed(d.id, false))}><RotateCcw className="h-4 w-4" /></IconBtn>
                      <IconBtn label="Delete forever" onClick={() => { if (window.confirm('Delete this document forever? This cannot be undone.')) act(() => deleteDocumentForever(d.id)); }}><Trash2 className="h-4 w-4 text-danger" /></IconBtn>
                    </>
                  ) : (
                    <>
                      <IconBtn label={d.starred ? 'Remove star' : 'Star'} onClick={() => act(() => setStarred(d.id, !d.starred))}><Star className={`h-4 w-4 ${d.starred ? 'fill-current text-accent' : ''}`} /></IconBtn>
                      <IconBtn label="Make a copy" onClick={() => act(() => duplicateDocument(userId, d.id))}><Copy className="h-4 w-4" /></IconBtn>
                      <IconBtn label="Move to trash" onClick={() => act(() => setTrashed(d.id, true))}><Trash2 className="h-4 w-4" /></IconBtn>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-bg-muted hover:text-fg">
      {children}
    </button>
  );
}
