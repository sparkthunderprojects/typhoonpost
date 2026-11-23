import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import FontFamily from '@tiptap/extension-font-family';
import Placeholder from '@tiptap/extension-placeholder';
import { ArrowLeft, Download, History, Loader2, X } from 'lucide-react';
import { Toolbar } from './Toolbar';
import { DocFontSize, DocParagraphStyle, DocSearch, searchKey } from './extensions';
import { countWords } from './format';
import { exportDocx, exportHtml, exportMarkdown, exportText, printDocument } from './exporters';
import {
  ConflictError, TooLargeError, clearPending, listVersions, openDocument, openVersion, readPending, saveDocument,
  setStarred, snapshotVersion, createDocument, writePending,
} from './store';
import type { DocBody, DocSummary, DocVersion, PageSize, PMNode } from './types';

type Status = 'loading' | 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict' | 'toolarge' | 'error';

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;
const AUTOSAVE_MS = 1500;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

interface Props {
  id: string;
  userId: string;
  onClose: () => void;
  onSaved: (s: DocSummary) => void;
}

export function DocEditor({ id, userId, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [page, setPage] = useState<PageSize>('a4');
  const [loaded, setLoaded] = useState<{ doc: PMNode } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [recovered, setRecovered] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<DocVersion[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);
  const [selWords, setSelWords] = useState(0);
  const [starred, setStar] = useState(false);

  const rev = useRef(1);
  const edits = useRef(0); // counts every change; a save only clears "dirty" if nothing changed meanwhile
  const saving = useRef(false);
  const lastSnap = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const titleRef = useRef('');
  const pageRef = useRef<PageSize>('a4');
  const statusRef = useRef<Status>('loading');
  const setSt = (s: Status) => { statusRef.current = s; setStatus(s); };

  // --- load -----------------------------------------------------------------
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { summary, body } = await openDocument(id);
        if (cancel) return;
        rev.current = summary.revision;
        titleRef.current = summary.title;
        pageRef.current = body.page.size;
        setTitle(summary.title === 'Untitled document' ? '' : summary.title);
        setPage(body.page.size);
        setStar(summary.starred);
        let doc = body.doc;
        const pend = readPending(id);
        if (pend && JSON.stringify(pend.body.doc) !== JSON.stringify(body.doc)) {
          doc = pend.body.doc;
          titleRef.current = pend.title;
          setTitle(pend.title === 'Untitled document' ? '' : pend.title);
          setRecovered(true);
          edits.current = 1;
          setSt(pend.revision < summary.revision ? 'conflict' : 'dirty');
          if (pend.revision < summary.revision) setMessage('You have unsaved changes from an earlier visit, and this document has changed since.');
        } else {
          setSt('saved');
        }
        lastSnap.current = Date.now();
        setLoaded({ doc });
      } catch (e) {
        if (!cancel) setLoadError(e instanceof Error ? e.message : 'Could not open this document.');
      }
    })();
    return () => { cancel = true; };
  }, [id]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false, underline: false }),
        Underline,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TextStyle, Color, Highlight.configure({ multicolor: true }),
        Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow' } }),
        Image.configure({ inline: false, allowBase64: true }),
        Table.configure({ resizable: true }), TableRow, TableHeader,
        TableCell.extend({
          addAttributes() {
            return {
              ...this.parent?.(),
              backgroundColor: {
                default: null,
                parseHTML: (el) => el.style.backgroundColor || null,
                renderHTML: (a) => (a.backgroundColor ? { style: `background-color: ${a.backgroundColor}` } : {}),
              },
            };
          },
        }),
        TaskList, TaskItem.configure({ nested: true }),
        Subscript, Superscript, FontFamily, DocFontSize, DocParagraphStyle, DocSearch,
        Placeholder.configure({ placeholder: 'Start writing…' }),
      ],
      content: loaded?.doc,
      shouldRerenderOnTransaction: true,
      editorProps: { attributes: { class: 'doc-canvas', spellcheck: 'true', 'aria-label': 'Document text', role: 'textbox', 'aria-multiline': 'true' } },
      onUpdate: ({ editor: ed }) => {
        edits.current += 1;
        const t = ed.getText();
        setWords(countWords(t));
        setChars(t.length);
        markDirty();
      },
      onSelectionUpdate: ({ editor: ed }) => {
        const { from, to, empty } = ed.state.selection;
        setSelWords(empty ? 0 : countWords(ed.state.doc.textBetween(from, to, ' ')));
      },
    },
    [loaded],
  );

  useEffect(() => {
    if (editor) {
      const t = editor.getText();
      setWords(countWords(t));
      setChars(t.length);
    }
  }, [editor]);

  const currentBody = useCallback((): DocBody => ({ v: 1, doc: editor!.getJSON() as PMNode, page: { size: pageRef.current } }), [editor]);

  // --- saving -----------------------------------------------------------------
  const flush = useCallback(async () => {
    if (!editor || saving.current || statusRef.current === 'conflict' || statusRef.current === 'toolarge') return;
    if (edits.current === 0) return;
    saving.current = true;
    const mark = edits.current;
    setSt('saving');
    const body = currentBody();
    const ttl = titleRef.current.trim() || 'Untitled document';
    try {
      const s = await saveDocument(id, rev.current, ttl, body);
      rev.current = s.revision;
      onSaved(s);
      if (edits.current === mark) { edits.current = 0; clearPending(id); setSt('saved'); setMessage(''); }
      else { setSt('dirty'); schedule(); }
      if (Date.now() - lastSnap.current > SNAPSHOT_EVERY_MS) {
        lastSnap.current = Date.now();
        snapshotVersion(id, userId, ttl, body, null).catch(() => undefined);
      }
    } catch (e) {
      if (e instanceof ConflictError) { setSt('conflict'); setMessage('This document was saved somewhere else since you opened it.'); }
      else if (e instanceof TooLargeError) { setSt('toolarge'); setMessage(e.message); }
      else { setSt('offline'); schedule(8000); }
    } finally {
      saving.current = false;
    }
  }, [editor, id, userId, currentBody, onSaved]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  function schedule(ms = AUTOSAVE_MS) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flushRef.current(), ms);
  }

  function markDirty() {
    if (statusRef.current === 'loading') return;
    if (statusRef.current !== 'conflict' && statusRef.current !== 'toolarge') setSt('dirty');
    if (editor) writePending(id, { revision: rev.current, title: titleRef.current.trim() || 'Untitled document', body: currentBody(), at: Date.now() });
    schedule();
  }

  useEffect(() => () => { window.clearTimeout(timer.current); }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (edits.current > 0) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    const online = () => { if (statusRef.current === 'offline') flushRef.current(); };
    window.addEventListener('online', online);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('online', online); };
  }, []);

  const close = async () => {
    window.clearTimeout(timer.current);
    if (edits.current > 0 && editor) await flush();
    onClose();
  };

  // --- conflict handling ------------------------------------------------------
  const keepMineAsCopy = async () => {
    if (!editor) return;
    try {
      await createDocument(userId, `${titleRef.current || 'Untitled document'} (my changes)`, editor.getJSON() as PMNode);
      edits.current = 0; clearPending(id);
      const { summary, body } = await openDocument(id);
      rev.current = summary.revision; titleRef.current = summary.title; setTitle(summary.title);
      editor.commands.setContent(body.doc as never, { emitUpdate: false });
      setSt('saved'); setMessage(''); setRecovered(false); onSaved(summary);
    } catch { setMessage('Could not save a copy. Your text is still on this device.'); }
  };
  const overwriteWithMine = async () => {
    try {
      const { summary } = await openDocument(id);
      await snapshotVersion(id, userId, summary.title, (await openDocument(id)).body, 'Before overwrite').catch(() => undefined);
      rev.current = summary.revision;
      setSt('dirty'); setMessage('');
      await flush();
    } catch { setMessage('Could not reach the server. Your text is still on this device.'); }
  };
  const useTheirs = async () => {
    if (!editor) return;
    clearPending(id); edits.current = 0;
    const { summary, body } = await openDocument(id);
    rev.current = summary.revision; titleRef.current = summary.title; setTitle(summary.title);
    editor.commands.setContent(body.doc as never, { emitUpdate: false });
    setSt('saved'); setMessage(''); setRecovered(false);
  };

  // --- other actions ---------------------------------------------------------------
  const onImage = (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) { setMessage('That image is larger than 3 MB. Choose a smaller one.'); return; }
    const r = new FileReader();
    r.onload = () => editor?.chain().focus().setImage({ src: String(r.result), alt: '' }).run();
    r.readAsDataURL(file);
  };

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) editor.chain().focus().unsetLink().run();
    else {
      const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkOpen(false);
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setVersions(null);
    try { setVersions(await listVersions(id)); } catch { setVersions([]); }
  };
  const restore = async (v: DocVersion) => {
    if (!editor) return;
    if (!window.confirm('Restore this version? Your current text is saved as a version first.')) return;
    try {
      await snapshotVersion(id, userId, titleRef.current || 'Untitled document', currentBody(), 'Before restore');
      const body = await openVersion(v.id);
      editor.commands.setContent(body.doc as never, { emitUpdate: true });
      setHistoryOpen(false);
    } catch { setMessage('Could not restore that version.'); }
  };

  const exportAs = async (kind: 'docx' | 'pdf' | 'md' | 'html' | 'txt') => {
    if (!editor) return;
    setExportOpen(false);
    const ttl = titleRef.current.trim() || 'Untitled document';
    const doc = editor.getJSON() as PMNode;
    try {
      if (kind === 'docx') await exportDocx(ttl, doc, pageRef.current);
      else if (kind === 'pdf') printDocument(ttl, editor.getHTML(), pageRef.current);
      else if (kind === 'md') exportMarkdown(ttl, doc);
      else if (kind === 'html') exportHtml(ttl, editor.getHTML(), pageRef.current);
      else exportText(ttl, doc);
    } catch { setMessage('Export failed. Your document is unchanged.'); }
  };

  const openFind = () => {
    setFindOpen(true);
    window.setTimeout(() => document.getElementById('doc-find-input')?.focus(), 0);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && document.querySelector('.doc-canvas')?.contains(document.activeElement)) {
        e.preventDefault();
        openFind();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const statusText = useMemo(() => {
    switch (status) {
      case 'loading': return 'Opening…';
      case 'saved': return 'Saved';
      case 'dirty': return 'Unsaved changes';
      case 'saving': return 'Saving…';
      case 'offline': return 'Offline. Changes are kept on this device and will save when you reconnect.';
      case 'conflict': return 'Not saved: conflict';
      case 'toolarge': return 'Not saved: too large';
      default: return 'Error';
    }
  }, [status]);

  if (loadError) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-sm">
        <p className="font-semibold text-danger">Could not open this document</p>
        <p className="max-w-md text-center text-fg-muted">{loadError}</p>
        <button onClick={onClose} className="rounded-lg bg-accent px-3 py-1.5 text-accent-fg">Back to documents</button>
      </div>
    );
  }

  const findState = editor ? searchKey.getState(editor.state) : undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-bg-muted">
      <div className="flex items-center gap-2 border-b border-line bg-bg px-3 py-2">
        <button onClick={close} aria-label="Back to documents" title="Back to documents" className="flex h-8 w-8 items-center justify-center rounded text-fg-muted hover:bg-bg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /></button>
        <input
          aria-label="Document title"
          value={title}
          placeholder="Untitled document"
          onChange={(e) => { setTitle(e.target.value); titleRef.current = e.target.value; edits.current += 1; markDirty(); }}
          className="min-w-0 flex-1 rounded bg-transparent px-2 py-1 text-base font-semibold text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <span role="status" aria-live="polite" className={`hidden text-xs sm:inline ${status === 'conflict' || status === 'toolarge' || status === 'offline' ? 'text-danger' : 'text-fg-muted'}`}>
          {status === 'saving' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}{statusText}
        </span>
        <button
          onClick={() => { const s = !starred; setStar(s); setStarred(id, s).catch(() => setStar(!s)); }}
          aria-pressed={starred} title={starred ? 'Remove star' : 'Star'} className="rounded px-2 py-1 text-sm text-fg-muted hover:bg-bg-muted"
        >{starred ? '★' : '☆'}</button>
        <select aria-label="Page size" value={page} onChange={(e) => { const v = e.target.value as PageSize; setPage(v); pageRef.current = v; edits.current += 1; markDirty(); }} className="h-8 rounded border border-line bg-bg px-1.5 text-xs">
          <option value="a4">A4</option><option value="letter">Letter</option>
        </select>
        <button onClick={openHistory} title="Version history" className="flex h-8 items-center gap-1 rounded px-2 text-xs text-fg-muted hover:bg-bg-muted hover:text-fg"><History className="h-4 w-4" />History</button>
        <div className="relative">
          <button onClick={() => setExportOpen((o) => !o)} aria-haspopup="menu" aria-expanded={exportOpen} className="flex h-8 items-center gap-1 rounded bg-accent px-3 text-xs font-medium text-accent-fg"><Download className="h-4 w-4" />Export</button>
          {exportOpen && (
            <div role="menu" className="absolute right-0 top-9 z-30 w-48 rounded-lg border border-line bg-bg py-1 text-sm shadow-panel">
              {([['docx', 'Word (.docx)'], ['pdf', 'PDF (print dialog)'], ['md', 'Markdown (.md)'], ['html', 'Web page (.html)'], ['txt', 'Plain text (.txt)']] as const).map(([k, l]) => (
                <button key={k} role="menuitem" onClick={() => exportAs(k)} className="block w-full px-3 py-1.5 text-left hover:bg-bg-muted">{l}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(status === 'conflict' || message) && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-line bg-bg-subtle px-4 py-2 text-sm">
          <span className={status === 'conflict' || status === 'toolarge' ? 'text-danger' : 'text-fg'}>{message}</span>
          {status === 'conflict' && (
            <>
              <button onClick={keepMineAsCopy} className="rounded border border-line px-2 py-1 text-xs hover:bg-bg-muted">Save mine as a copy and open the other</button>
              <button onClick={overwriteWithMine} className="rounded border border-line px-2 py-1 text-xs hover:bg-bg-muted">Replace the other with mine</button>
              <button onClick={useTheirs} className="rounded border border-line px-2 py-1 text-xs hover:bg-bg-muted">Discard mine</button>
            </>
          )}
          {status !== 'conflict' && <button onClick={() => setMessage('')} aria-label="Dismiss" className="ml-auto"><X className="h-4 w-4" /></button>}
        </div>
      )}
      {recovered && status !== 'conflict' && <div className="border-b border-line bg-bg-subtle px-4 py-1.5 text-xs text-fg-muted">Recovered changes that were kept on this device. They are saving now.</div>}

      {editor && (
        <>
          <Toolbar editor={editor} onLink={() => { setLinkUrl((editor.getAttributes('link').href as string) ?? ''); setLinkOpen(true); }} onImage={onImage} onFind={openFind} />
          {editor.isActive('image') && (
            <div className="flex items-center gap-2 border-b border-line bg-bg px-3 py-1 text-xs">
              <label htmlFor="doc-alt">Image description (alt text)</label>
              <input id="doc-alt" className="h-7 flex-1 rounded border border-line bg-bg px-2" value={(editor.getAttributes('image').alt as string) ?? ''} onChange={(e) => editor.chain().updateAttributes('image', { alt: e.target.value }).run()} />
            </div>
          )}
          {linkOpen && (
            <div className="flex items-center gap-2 border-b border-line bg-bg px-3 py-1 text-xs">
              <label htmlFor="doc-link">Link address</label>
              <input id="doc-link" autoFocus className="h-7 flex-1 rounded border border-line bg-bg px-2" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyLink()} placeholder="https://" />
              <button onClick={applyLink} className="rounded bg-accent px-2 py-1 text-accent-fg">Apply</button>
              <button onClick={() => setLinkOpen(false)} className="rounded px-2 py-1 hover:bg-bg-muted">Cancel</button>
            </div>
          )}
          {findOpen && (
            <FindBar
              onClose={() => { editor.commands.setSearch('', false, false); setFindOpen(false); }}
              count={findState?.matches.length ?? 0}
              index={findState?.index ?? 0}
              onSearch={(t, cs, ww) => editor.commands.setSearch(t, cs, ww)}
              onStep={(d) => editor.commands.stepSearch(d)}
              onReplace={(r) => editor.commands.replaceCurrent(r)}
              onReplaceAll={(r) => editor.commands.replaceAll(r)}
            />
          )}
        </>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4 py-6">
        {status === 'loading' || !editor ? (
          <div className="flex justify-center py-20 text-fg-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className={`doc-page mx-auto ${page === 'a4' ? 'doc-page-a4' : 'doc-page-letter'}`}>
            <EditorContent editor={editor} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-line bg-bg px-4 py-1 text-xs text-fg-muted">
        <span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>
        <span>{chars.toLocaleString()} characters</span>
        <span>{Math.max(1, Math.round(words / 230))} min read</span>
        {selWords > 0 && <span>{selWords} selected</span>}
        <span className="ml-auto sm:hidden">{statusText}</span>
      </div>

      {historyOpen && (
        <aside aria-label="Version history" className="absolute bottom-0 right-0 top-12 z-40 flex w-80 flex-col border-l border-line bg-bg shadow-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Version history</h2>
            <button onClick={() => setHistoryOpen(false)} aria-label="Close history"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {versions === null ? <Loader2 className="m-4 h-4 w-4 animate-spin" /> : versions.length === 0 ? (
              <p className="p-3 text-sm text-fg-muted">No earlier versions yet. A version is saved about every ten minutes while you write, and before a restore.</p>
            ) : versions.map((v) => (
              <div key={v.id} className="flex items-center gap-2 rounded px-2 py-2 hover:bg-bg-muted">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{new Date(v.createdAt).toLocaleString()}</p>
                  <p className="truncate text-xs text-fg-muted">{v.label ? `${v.label} · ` : ''}{v.words} words</p>
                </div>
                <button onClick={() => restore(v)} className="rounded border border-line px-2 py-1 text-xs hover:bg-bg">Restore</button>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

function FindBar({ count, index, onSearch, onStep, onReplace, onReplaceAll, onClose }: {
  count: number; index: number; onClose: () => void;
  onSearch: (t: string, cs: boolean, ww: boolean) => void; onStep: (d: 1 | -1) => void;
  onReplace: (r: string) => void; onReplaceAll: (r: string) => void;
}) {
  const [term, setTerm] = useState('');
  const [rep, setRep] = useState('');
  const [cs, setCs] = useState(false);
  const [ww, setWw] = useState(false);
  const run = (t: string, c: boolean, w: boolean) => { setTerm(t); setCs(c); setWw(w); onSearch(t, c, w); };
  return (
    <div role="search" aria-label="Find and replace" className="flex flex-wrap items-center gap-2 border-b border-line bg-bg px-3 py-1.5 text-xs">
      <input id="doc-find-input" aria-label="Find" placeholder="Find" value={term} onChange={(e) => run(e.target.value, cs, ww)} onKeyDown={(e) => { if (e.key === 'Enter') onStep(e.shiftKey ? -1 : 1); if (e.key === 'Escape') onClose(); }} className="h-7 w-44 rounded border border-line bg-bg px-2" />
      <span aria-live="polite" className="w-16 text-fg-muted">{term ? (count ? `${index + 1} of ${count}` : 'No matches') : ''}</span>
      <button onClick={() => onStep(-1)} className="rounded border border-line px-2 py-1 hover:bg-bg-muted">Previous</button>
      <button onClick={() => onStep(1)} className="rounded border border-line px-2 py-1 hover:bg-bg-muted">Next</button>
      <input aria-label="Replace with" placeholder="Replace with" value={rep} onChange={(e) => setRep(e.target.value)} className="h-7 w-40 rounded border border-line bg-bg px-2" />
      <button onClick={() => onReplace(rep)} className="rounded border border-line px-2 py-1 hover:bg-bg-muted">Replace</button>
      <button onClick={() => { if (count > 0 && window.confirm(`Replace all ${count} matches?`)) onReplaceAll(rep); }} className="rounded border border-line px-2 py-1 hover:bg-bg-muted">Replace all</button>
      <label className="flex items-center gap-1"><input type="checkbox" checked={cs} onChange={(e) => run(term, e.target.checked, ww)} />Match case</label>
      <label className="flex items-center gap-1"><input type="checkbox" checked={ww} onChange={(e) => run(term, cs, e.target.checked)} />Whole word</label>
      <button onClick={onClose} aria-label="Close find" className="ml-auto"><X className="h-4 w-4" /></button>
    </div>
  );
}

