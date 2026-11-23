import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Superscript, Subscript, RemoveFormatting, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, ListChecks, Quote, Code2, Minus,
  Link as LinkIcon, Image as ImageIcon, Table as TableIcon, Undo2, Redo2, Indent as IndentIncrease, Outdent as IndentDecrease, Search,
} from 'lucide-react';

const FONTS = [
  { label: 'Calibri', value: 'Calibri, Carlito, sans-serif' },
  { label: 'Arial', value: 'Arial, Liberation Sans, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Liberation Serif, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", Liberation Mono, monospace' },
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
];
const SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48', '72'];
const SPACING = ['1', '1.15', '1.5', '2', '2.5', '3'];

function Btn({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg disabled:opacity-40 ${active ? 'bg-bg-muted text-accent' : ''}`}
    >
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;
const sel = 'h-8 rounded border border-line bg-bg px-1.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-accent';

interface Props {
  editor: Editor;
  onLink: () => void;
  onImage: (file: File) => void;
  onFind: () => void;
}

export function Toolbar({ editor, onLink, onImage, onFind }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const c = () => editor.chain().focus();
  const inTable = editor.isActive('table');

  const blockValue = (() => {
    for (let i = 1; i <= 6; i++) if (editor.isActive('heading', { level: i })) return `h${i}`;
    if (editor.isActive('blockquote')) return 'quote';
    if (editor.isActive('paragraph', { docStyle: 'title' })) return 'title';
    if (editor.isActive('paragraph', { docStyle: 'subtitle' })) return 'subtitle';
    return 'p';
  })();

  const setBlock = (v: string) => {
    const ch = c();
    if (v === 'p') ch.setDocStyle(null).run();
    else if (v === 'title' || v === 'subtitle') ch.setDocStyle(v).run();
    else if (v === 'quote') ch.setParagraph().setBlockquote().run();
    else ch.setDocStyle(null).setHeading({ level: Number(v[1]) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
  };

  const textStyle = editor.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string };
  const tableAction = (v: string) => {
    const ch = c();
    switch (v) {
      case 'insert': ch.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
      case 'addRow': ch.addRowAfter().run(); break;
      case 'addCol': ch.addColumnAfter().run(); break;
      case 'delRow': ch.deleteRow().run(); break;
      case 'delCol': ch.deleteColumn().run(); break;
      case 'merge': ch.mergeCells().run(); break;
      case 'split': ch.splitCell().run(); break;
      case 'header': ch.toggleHeaderRow().run(); break;
      case 'shade': ch.setCellAttribute('backgroundColor', '#fef9c3').run(); break;
      case 'unshade': ch.setCellAttribute('backgroundColor', null).run(); break;
      case 'delete': ch.deleteTable().run(); break;
    }
  };

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-line bg-bg-subtle px-2 py-1">
      <Btn label="Undo" disabled={!editor.can().undo()} onClick={() => c().undo().run()}><Undo2 className="h-4 w-4" /></Btn>
      <Btn label="Redo" disabled={!editor.can().redo()} onClick={() => c().redo().run()}><Redo2 className="h-4 w-4" /></Btn>
      <Sep />
      <select aria-label="Paragraph style" className={sel} value={blockValue} onChange={(e) => setBlock(e.target.value)}>
        <option value="p">Normal</option><option value="title">Title</option><option value="subtitle">Subtitle</option>
        {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={`h${n}`}>Heading {n}</option>)}
        <option value="quote">Quote</option>
      </select>
      <select aria-label="Font" className={`${sel} w-32`} value={FONTS.find((f) => f.value === textStyle.fontFamily)?.value ?? ''} onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}>
        <option value="">Default font</option>
        {FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
      </select>
      <select aria-label="Font size" className={`${sel} w-16`} value={textStyle.fontSize ? String(parseFloat(textStyle.fontSize)) : ''} onChange={(e) => (e.target.value ? c().setFontSize(`${e.target.value}pt`).run() : c().unsetFontSize().run())}>
        <option value="">Size</option>
        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <Sep />
      <Btn label="Bold" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
      <Btn label="Italic" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
      <Btn label="Underline" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></Btn>
      <Btn label="Strikethrough" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Btn>
      <Btn label="Superscript" active={editor.isActive('superscript')} onClick={() => c().toggleSuperscript().run()}><Superscript className="h-4 w-4" /></Btn>
      <Btn label="Subscript" active={editor.isActive('subscript')} onClick={() => c().toggleSubscript().run()}><Subscript className="h-4 w-4" /></Btn>
      <label title="Text colour" className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-bg-muted">
        <span className="text-sm font-bold" style={{ color: textStyle.color ?? 'inherit' }}>A</span>
        <input aria-label="Text colour" type="color" value={textStyle.color ?? '#000000'} onChange={(e) => c().setColor(e.target.value).run()} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <label title="Highlight colour" className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded text-fg-muted hover:bg-bg-muted">
        <Highlighter className="h-4 w-4" />
        <input aria-label="Highlight colour" type="color" defaultValue="#fef08a" onChange={(e) => c().setHighlight({ color: e.target.value }).run()} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <Btn label="Clear formatting" onClick={() => c().unsetAllMarks().setDocStyle(null).run()}><RemoveFormatting className="h-4 w-4" /></Btn>
      <Sep />
      <Btn label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => c().setTextAlign('left').run()}><AlignLeft className="h-4 w-4" /></Btn>
      <Btn label="Align centre" active={editor.isActive({ textAlign: 'center' })} onClick={() => c().setTextAlign('center').run()}><AlignCenter className="h-4 w-4" /></Btn>
      <Btn label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => c().setTextAlign('right').run()}><AlignRight className="h-4 w-4" /></Btn>
      <Btn label="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => c().setTextAlign('justify').run()}><AlignJustify className="h-4 w-4" /></Btn>
      <select aria-label="Line spacing" className={`${sel} w-20`} value={(editor.getAttributes('paragraph').lineHeight as string) ?? ''} onChange={(e) => c().setLineHeight(e.target.value || null).run()}>
        <option value="">Spacing</option>
        {SPACING.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <Sep />
      <Btn label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}><List className="h-4 w-4" /></Btn>
      <Btn label="Numbered list" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Btn>
      <Btn label="Checklist" active={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()}><ListChecks className="h-4 w-4" /></Btn>
      <Btn label="Increase indent" onClick={() => (editor.isActive('taskList') ? c().sinkListItem('taskItem').run() : c().sinkListItem('listItem').run())}><IndentIncrease className="h-4 w-4" /></Btn>
      <Btn label="Decrease indent" onClick={() => (editor.isActive('taskList') ? c().liftListItem('taskItem').run() : c().liftListItem('listItem').run())}><IndentDecrease className="h-4 w-4" /></Btn>
      <Sep />
      <Btn label="Block quote" active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Btn>
      <Btn label="Code block" active={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()}><Code2 className="h-4 w-4" /></Btn>
      <Btn label="Horizontal line" onClick={() => c().setHorizontalRule().run()}><Minus className="h-4 w-4" /></Btn>
      <Btn label="Link" active={editor.isActive('link')} onClick={onLink}><LinkIcon className="h-4 w-4" /></Btn>
      <Btn label="Insert image" onClick={() => fileRef.current?.click()}><ImageIcon className="h-4 w-4" /></Btn>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = ''; }} />
      <Btn label="Insert table" onClick={() => tableAction('insert')}><TableIcon className="h-4 w-4" /></Btn>
      {inTable && (
        <select aria-label="Table actions" className={`${sel} w-28`} value="" onChange={(e) => { tableAction(e.target.value); e.target.value = ''; }}>
          <option value="">Table…</option>
          <option value="addRow">Add row below</option><option value="addCol">Add column right</option>
          <option value="delRow">Delete row</option><option value="delCol">Delete column</option>
          <option value="merge">Merge cells</option><option value="split">Split cell</option>
          <option value="header">Toggle header row</option><option value="shade">Shade cell</option><option value="unshade">Clear shading</option>
          <option value="delete">Delete table</option>
        </select>
      )}
      <Sep />
      <Btn label="Find and replace" onClick={onFind}><Search className="h-4 w-4" /></Btn>
    </div>
  );
}
