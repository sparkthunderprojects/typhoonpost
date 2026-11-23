import { useState, type ReactNode } from 'react';
import {
  Inbox, Flag, Send, FileText, Archive, Trash2, ShieldAlert, Clock, Users, ChevronDown, ChevronRight,
  Folder, FolderPlus, MoreHorizontal, Plus, Pencil, Search, X,
} from 'lucide-react';
import type { BuiltInFolderId, FolderId, LabelId, AppView } from '@/types';
import { addCategory, addFolder, categoryDefs, descendantIds, editCategory, folderName, folderTree, moveFolderTo, nudgeFolder, removeCategory, removeFolder, removeSearch, renameFolder, toggleFavourite, usePrefs } from '@/lib/prefs';
import { FOLDER_MIME, isFolderDrag, isMailDrag, readMailDrag } from '@/lib/dnd';

interface SidebarProps {
  activeFolder: FolderId;
  onFolderChange: (f: FolderId) => void;
  counts: Record<string, number>;
  activeLabel: LabelId | null;
  onLabelToggle: (l: LabelId) => void;
  labelCounts: Record<string, number>;
  onDropMail: (ids: string[], folder: FolderId) => void;
  onDropLabel: (ids: string[], label: LabelId) => void;
  onFolderDeleted: (folderIds: FolderId[]) => void;
  view: AppView;
  taskCount: number;
  userEmail: string;
  contactCount: number;
  eventCount: number;
  activeSearchId: string | null;
  onSearchSelect: (id: string) => void;
  searchCounts: Record<string, number>;
}

const ICONS: Record<BuiltInFolderId, typeof Inbox> = {
  inbox: Inbox, starred: Flag, snoozed: Clock, sent: Send, drafts: FileText, archive: Archive, trash: Trash2, spam: ShieldAlert,
};

const BUILT_IN: BuiltInFolderId[] = ['inbox', 'drafts', 'sent', 'trash', 'spam', 'archive', 'snoozed', 'starred'];
// Folders whose badge shows an unread count; the rest show a plain total only for flagged/snoozed.
const UNREAD_BADGE: string[] = ['inbox', 'drafts', 'spam'];
const SWATCHES = ['#2563eb', '#ec4899', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#0891b2', '#64748b'];
// Dropping onto these would not mean anything useful.
const NO_DROP: string[] = ['starred', 'drafts', 'sent'];

function Section({ title, children, action, defaultOpen = true }: { title: string; children: ReactNode; action?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="mb-2">
      <div className="flex items-center">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1 text-left text-[13px] font-semibold text-fg hover:bg-bg-muted" aria-expanded={open}>
          <Chevron className="h-3.5 w-3.5 text-fg-muted" />
          <span className="truncate">{title}</span>
        </button>
        {action}
      </div>
      {open && <ul className="mt-0.5 space-y-px">{children}</ul>}
    </div>
  );
}

/** Inline text box used for naming folders and categories. */
function NameBox({ initial, placeholder, onDone, onCancel }: { initial?: string; placeholder: string; onDone: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial ?? '');
  return (
    <input
      autoFocus
      aria-label={placeholder}
      placeholder={placeholder}
      value={v}
      maxLength={60}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() ? onDone(v) : onCancel())}
      onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) onDone(v); if (e.key === 'Escape') onCancel(); }}
      className="mx-2 my-0.5 h-7 w-[calc(100%-1rem)] rounded border border-accent bg-bg px-2 text-sm text-fg outline-none"
    />
  );
}

export function Sidebar({
  activeFolder, onFolderChange, counts, activeLabel, onLabelToggle, labelCounts, onDropMail, onDropLabel, onFolderDeleted,
  view, taskCount, userEmail, contactCount, eventCount, activeSearchId, onSearchSelect, searchCounts,
}: SidebarProps) {
  const prefs = usePrefs();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ kind: 'folder' | 'category' | 'rename-folder' | 'rename-category'; parent?: string | null; id?: string; initial?: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const dropProps = (target: string, onMail: (ids: string[]) => void, folderId?: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (isMailDrag(e) || (folderId && isFolderDrag(e))) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropTarget !== target) setDropTarget(target); }
    },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      if (isMailDrag(e)) { const ids = readMailDrag(e); if (ids.length) onMail(ids); }
      else if (folderId && isFolderDrag(e)) { const dragged = e.dataTransfer.getData(FOLDER_MIME); if (dragged) moveFolderTo(dragged, folderId); }
    },
  });
  const hot = (t: string) => (dropTarget === t ? 'ring-2 ring-accent bg-accent-soft' : '');

  const builtInRow = (id: BuiltInFolderId) => {
    const active = activeFolder === id && !activeLabel;
    const Icon = ICONS[id];
    const count = counts[id] ?? 0;
    const showBadge = count > 0 && (UNREAD_BADGE.includes(id) || id === 'starred' || id === 'snoozed');
    const droppable = !NO_DROP.includes(id);
    return (
      <li key={id} {...(droppable ? dropProps(id, (ids) => onDropMail(ids, id)) : {})}>
        <button
          onClick={() => onFolderChange(id)}
          aria-current={active ? 'page' : undefined}
          className={`relative flex w-full items-center gap-2.5 rounded py-1.5 pl-6 pr-2 text-sm transition-colors ${active ? 'bg-accent-soft font-semibold text-fg' : 'text-fg hover:bg-bg-muted'} ${hot(id)}`}
        >
          {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r bg-accent" />}
          <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : 'text-fg-muted'}`} />
          <span className="flex-1 truncate text-left">{folderName(id, prefs)}</span>
          {showBadge && <span className={`text-xs ${active || UNREAD_BADGE.includes(id) ? 'font-semibold text-accent' : 'text-fg-subtle'}`}>{count}</span>}
        </button>
      </li>
    );
  };

  const customRow = (f: { id: string; name: string; color: string }, depth: number) => {
    const fid = `f:${f.id}` as FolderId;
    const active = activeFolder === fid && !activeLabel;
    const count = counts[fid] ?? 0;
    const fav = prefs.favourites.includes(fid);
    return (
      <li key={fid} {...dropProps(fid, (ids) => onDropMail(ids, fid), f.id)} className="group relative">
        {naming?.kind === 'rename-folder' && naming.id === f.id ? (
          <NameBox initial={f.name} placeholder="Folder name" onDone={(v) => { renameFolder(f.id, v); setNaming(null); }} onCancel={() => setNaming(null)} />
        ) : (
          <button
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(FOLDER_MIME, f.id); e.dataTransfer.effectAllowed = 'move'; }}
            onClick={() => onFolderChange(fid)}
            aria-current={active ? 'page' : undefined}
            style={{ paddingLeft: 24 + depth * 14 }}
            className={`relative flex w-full items-center gap-2.5 rounded py-1.5 pr-8 text-sm transition-colors ${active ? 'bg-accent-soft font-semibold text-fg' : 'text-fg hover:bg-bg-muted'} ${hot(fid)}`}
          >
            {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r bg-accent" />}
            <Folder className="h-4 w-4 shrink-0" style={{ color: f.color }} fill={`${f.color}33`} />
            <span className="flex-1 truncate text-left">{f.name}</span>
            {count > 0 && <span className="text-xs font-semibold text-accent">{count}</span>}
          </button>
        )}
        <button aria-label={`Options for ${f.name}`} onClick={() => setMenu(menu === fid ? null : fid)} className="absolute right-1 top-1 rounded p-1 text-fg-subtle opacity-0 hover:bg-bg-muted hover:text-fg focus:opacity-100 group-hover:opacity-100">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menu === fid && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div role="menu" className="absolute right-1 top-8 z-50 w-48 rounded-lg border border-line-strong bg-bg-subtle py-1 text-sm shadow-pop">
              <MenuItem onClick={() => { setNaming({ kind: 'rename-folder', id: f.id }); setMenu(null); }}>Rename</MenuItem>
              <MenuItem onClick={() => { setNaming({ kind: 'folder', parent: f.id }); setMenu(null); }}>New subfolder</MenuItem>
              <MenuItem onClick={() => { toggleFavourite(fid); setMenu(null); }}>{fav ? 'Remove from Favorites' : 'Add to Favorites'}</MenuItem>
              <MenuItem onClick={() => { nudgeFolder(f.id, -1); setMenu(null); }}>Move up</MenuItem>
              <MenuItem onClick={() => { nudgeFolder(f.id, 1); setMenu(null); }}>Move down</MenuItem>
              {f.id && prefs.folders.find((x) => x.id === f.id)?.parent && <MenuItem onClick={() => { moveFolderTo(f.id, null); setMenu(null); }}>Move to top level</MenuItem>}
              <div className="flex gap-1 px-3 py-1.5">
                {SWATCHES.map((c) => <button key={c} aria-label={`Colour ${c}`} onClick={() => { renameFolder(f.id, f.name, c); setMenu(null); }} className="h-4 w-4 rounded-full border border-line" style={{ backgroundColor: c }} />)}
              </div>
              <MenuItem danger onClick={() => {
                setMenu(null);
                if (window.confirm(`Delete the folder "${f.name}"? Messages in it move to the Inbox.`)) { onFolderDeleted([fid, ...descendantIds(prefs, f.id).map((d) => `f:${d}` as FolderId)]); removeFolder(f.id); if (activeFolder === fid) onFolderChange('inbox'); }
              }}>Delete folder</MenuItem>
            </div>
          </>
        )}
      </li>
    );
  };

  const favouriteRows = prefs.favourites.map((id) => {
    if (id in ICONS) return builtInRow(id as BuiltInFolderId);
    const f = prefs.folders.find((x) => `f:${x.id}` === id);
    return f ? customRow(f, -1) : null;
  });

  const cats = categoryDefs(prefs);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-bg">
      {view === 'mail' && (
        <nav className="flex-1 overflow-y-auto px-2 pt-3 scrollbar-thin" aria-label="Folders">
          <Section title="Favorites">{favouriteRows}</Section>
          <Section title={userEmail || 'Mailbox'}>{BUILT_IN.map(builtInRow)}</Section>
          <Section
            title="Folders"
            action={<button aria-label="New folder" title="New folder" onClick={() => setNaming({ kind: 'folder', parent: null })} className="rounded p-1 text-fg-muted hover:bg-bg-muted hover:text-fg"><FolderPlus className="h-4 w-4" /></button>}
          >
            {folderTree(prefs).map(({ folder, depth }) => customRow(folder, depth))}
            {naming?.kind === 'folder' && (
              <li><NameBox placeholder="Folder name" onDone={(v) => { addFolder(v, naming.parent ?? null); setNaming(null); }} onCancel={() => setNaming(null)} /></li>
            )}
            {prefs.folders.length === 0 && !naming && (
              <li className="px-6 py-1 text-xs leading-relaxed text-fg-subtle">Make your own folders, then drag messages onto them. Names are encrypted.</li>
            )}
            <li
              {...{
                onDragOver: (e: React.DragEvent) => { if (isFolderDrag(e)) { e.preventDefault(); setDropTarget('top'); } },
                onDragLeave: () => setDropTarget(null),
                onDrop: (e: React.DragEvent) => { e.preventDefault(); setDropTarget(null); const d = e.dataTransfer.getData(FOLDER_MIME); if (d) moveFolderTo(d, null); },
              }}
              className={`h-1 rounded ${hot('top')}`}
              aria-hidden
            />
          </Section>
          {prefs.savedSearches.length > 0 && (
            <Section title="Search folders">
              {prefs.savedSearches.map((q) => {
                const active = activeSearchId === q.id;
                const n = searchCounts[q.id] ?? 0;
                return (
                  <li key={q.id} className="group relative">
                    <button
                      onClick={() => onSearchSelect(q.id)}
                      aria-current={active ? 'page' : undefined}
                      title={q.query}
                      className={`relative flex w-full items-center gap-2.5 rounded py-1.5 pl-6 pr-8 text-sm transition-colors ${active ? 'bg-accent-soft font-semibold text-fg' : 'text-fg hover:bg-bg-muted'}`}
                    >
                      {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r bg-accent" />}
                      <Search className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : 'text-fg-muted'}`} />
                      <span className="flex-1 truncate text-left">{q.name}</span>
                      {n > 0 && <span className="text-xs font-semibold text-accent">{n}</span>}
                    </button>
                    <button
                      aria-label={`Remove search folder ${q.name}`}
                      onClick={() => { if (window.confirm(`Remove the search folder "${q.name}"? Your messages are not affected.`)) { removeSearch(q.id); if (active) onFolderChange('inbox'); } }}
                      className="absolute right-1 top-1 rounded p-1 text-fg-subtle opacity-0 hover:bg-bg-muted hover:text-fg focus:opacity-100 group-hover:opacity-100"
                    ><X className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </Section>
          )}
          <Section
            title="Categories"
            action={<button aria-label="New category" title="New category" onClick={() => setNaming({ kind: 'category' })} className="rounded p-1 text-fg-muted hover:bg-bg-muted hover:text-fg"><Plus className="h-4 w-4" /></button>}
          >
            {cats.map((l) => {
              const active = activeLabel === l.id;
              const custom = l.id.startsWith('c:');
              return (
                <li key={l.id} className="group relative" {...dropProps(l.id, (ids) => onDropLabel(ids, l.id))}>
                  {naming?.kind === 'rename-category' && naming.id === l.id ? (
                    <NameBox initial={l.name} placeholder="Category name" onDone={(v) => { editCategory(l.id, v, l.color); setNaming(null); }} onCancel={() => setNaming(null)} />
                  ) : (
                    <button onClick={() => onLabelToggle(l.id)} className={`flex w-full items-center gap-2.5 rounded py-1.5 pl-6 pr-8 text-sm transition-colors ${active ? 'bg-accent-soft font-semibold text-fg' : 'text-fg hover:bg-bg-muted'} ${hot(l.id)}`}>
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: l.color }} />
                      <span className="flex-1 truncate text-left">{l.name}</span>
                      {(labelCounts[l.id] ?? 0) > 0 && <span className="text-xs font-semibold text-accent">{labelCounts[l.id]}</span>}
                    </button>
                  )}
                  {custom && (
                    <>
                      <button aria-label={`Options for ${l.name}`} onClick={() => setMenu(menu === l.id ? null : l.id)} className="absolute right-1 top-1 rounded p-1 text-fg-subtle opacity-0 hover:bg-bg-muted hover:text-fg focus:opacity-100 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>
                      {menu === l.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                          <div role="menu" className="absolute right-1 top-8 z-50 w-44 rounded-lg border border-line-strong bg-bg-subtle py-1 text-sm shadow-pop">
                            <MenuItem onClick={() => { setNaming({ kind: 'rename-category', id: l.id }); setMenu(null); }}><Pencil className="mr-2 inline h-3.5 w-3.5" />Rename</MenuItem>
                            <div className="flex gap-1 px-3 py-1.5">{SWATCHES.map((c) => <button key={c} aria-label={`Colour ${c}`} onClick={() => { editCategory(l.id, l.name, c); setMenu(null); }} className="h-4 w-4 rounded-full border border-line" style={{ backgroundColor: c }} />)}</div>
                            <MenuItem danger onClick={() => { setMenu(null); if (window.confirm(`Delete the category "${l.name}"? It is removed from your messages.`)) { removeCategory(l.id); if (activeLabel === l.id) onLabelToggle(l.id); } }}>Delete category</MenuItem>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
            {naming?.kind === 'category' && (
              <li><NameBox placeholder="Category name" onDone={(v) => { addCategory(v, SWATCHES[prefs.categories.length % SWATCHES.length]); setNaming(null); }} onCancel={() => setNaming(null)} /></li>
            )}
          </Section>
        </nav>
      )}

      {view === 'calendar' && (
        <div className="flex-1 overflow-y-auto px-3 pt-4 scrollbar-thin">
          <div className="mb-2 px-1 text-[13px] font-semibold text-fg">Calendar</div>
          <div className="flex items-center justify-between rounded bg-accent-soft px-3 py-2 text-sm font-medium text-fg">
            <span>My calendar</span>
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-semibold text-accent-fg">{eventCount}</span>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-fg-subtle">Click any day to add an event, or click an existing event to edit or delete it.</p>
        </div>
      )}

      {view === 'contacts' && (
        <div className="flex-1 overflow-y-auto px-3 pt-4 scrollbar-thin">
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-semibold text-fg"><Users className="h-4 w-4 text-fg-muted" /> People</div>
          <div className="flex items-center justify-between rounded bg-accent-soft px-3 py-2 text-sm font-medium text-fg">
            <span>All contacts</span>
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-semibold text-accent-fg">{contactCount}</span>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-fg-subtle">Add, edit, flag and group the people you email. They appear instantly in the composer's recipient suggestions.</p>
        </div>
      )}

      {view === 'tasks' && (
        <div className="flex-1 overflow-y-auto px-3 pt-4 scrollbar-thin">
          <div className="mb-2 px-1 text-[13px] font-semibold text-fg">Tasks</div>
          <div className="flex items-center justify-between rounded bg-accent-soft px-3 py-2 text-sm font-medium text-fg">
            <span>Open tasks</span>
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-semibold text-accent-fg">{taskCount}</span>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-fg-subtle">Tasks are encrypted in your browser like your mail. Only you can read them.</p>
        </div>
      )}
    </aside>
  );
}

function MenuItem({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={`block w-full px-3 py-1.5 text-left hover:bg-bg-muted ${danger ? 'text-danger' : 'text-fg'}`}>{children}</button>
  );
}

