import { useEditor, EditorContent } from '@tiptap/react';
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
import SuperscriptExt from '@tiptap/extension-superscript';
import FontFamily from '@tiptap/extension-font-family';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Superscript as SuperscriptIcon, Subscript as SubscriptIcon,
  RemoveFormatting, Type, Palette, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ListChecks, Quote, Code, Code2, Minus,
  Link as LinkIcon, Image as ImageIcon, Table as TableIcon, TableProperties,
  Undo2, Redo2, X, Check, ChevronDown,
} from 'lucide-react';
import { FontSize as CustomFontSize } from '@/components/editor/FontSize';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const FONT_FAMILIES = [
  { label: 'Sans', value: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, ui-serif, serif' },
  { label: 'Mono', value: 'ui-monospace, monospace' },
];

const FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px'];

const TEXT_COLORS = ['#1a1a14', '#71717a', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#ec4899', '#8b5cf6', '#ffffff', '#000000'];
const HIGHLIGHT_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#fbcfe8', '#ddd6fe', 'transparent'];

export function RichTextEditor({ value, onChange, placeholder = 'Write your message here...' }: RichTextEditorProps) {
  const [showCode, setShowCode] = useState(false);
  const [codeText, setCodeText] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [fontFamilyOpen, setFontFamilyOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [activeFontFamily, setActiveFontFamily] = useState('Sans');
  const toolbarRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: 'email-link' } }),
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Subscript,
      SuperscriptExt,
      FontFamily,
      CustomFontSize,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'tiptap-canvas',
      },
    },
  });

  // sync external value changes (e.g. prefill) when not focused
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // close popovers on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setLinkOpen(false);
        setImageOpen(false);
        setTableOpen(false);
        setColorOpen(false);
        setHighlightOpen(false);
        setFontFamilyOpen(false);
        setFontSizeOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!editor) return null;

  // ---- Code view ----
  if (showCode) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-bg-muted px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
            <Code2 className="h-3.5 w-3.5" /> HTML Source
          </span>
          <button
            onClick={() => {
              editor.commands.setContent(codeText, { emitUpdate: false });
              onChange(codeText);
              setShowCode(false);
            }}
            className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-2xs font-semibold text-accent-fg"
          >
            <Check className="h-3 w-3" /> Apply
          </button>
        </div>
        <textarea
          value={codeText}
          onChange={(e) => setCodeText(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none bg-bg p-3 font-mono text-xs text-fg focus:outline-none scrollbar-thin"
        />
      </div>
    );
  }

  const setLink = () => {
    if (linkUrl.trim()) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  };

  const addImage = () => {
    if (imageUrl.trim()) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
      setImageOpen(false);
      setImageUrl('');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);
    setImageOpen(false);
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: true }).run();
    setTableOpen(false);
  };

  const setTextColor = (color: string) => {
    if (color === 'transparent') {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setColorOpen(false);
  };

  const setHighlight = (color: string) => {
    if (color === 'transparent') {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    setHighlightOpen(false);
  };

  const applyFontFamily = (value: string, label: string) => {
    editor.chain().focus().setFontFamily(value).run();
    setActiveFontFamily(label);
    setFontFamilyOpen(false);
  };

  const applyFontSize = (size: string) => {
    editor.chain().focus().setFontSize(size).run();
    setFontSizeOpen(false);
  };

  const clearFormatting = () => {
    editor.chain().focus().unsetAllMarks().clearNodes().run();
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div ref={toolbarRef} className="relative flex flex-wrap items-center gap-0.5 border-b border-line bg-bg-muted px-2 py-1.5">
        {/* History */}
        <TB title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 className="h-4 w-4" />
        </TB>
        <TB title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 className="h-4 w-4" />
        </TB>
        <Divider />

        {/* Text formatting */}
        <TB title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </TB>
        <TB title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </TB>
        <TB title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </TB>
        <TB title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </TB>
        <TB title="Superscript" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
          <SuperscriptIcon className="h-4 w-4" />
        </TB>
        <TB title="Subscript" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}>
          <SubscriptIcon className="h-4 w-4" />
        </TB>
        <TB title="Clear formatting" onClick={clearFormatting}>
          <RemoveFormatting className="h-4 w-4" />
        </TB>
        <Divider />

        {/* Typography */}
        <div className="relative">
          <button
            onClick={() => { setFontFamilyOpen((v) => !v); setFontSizeOpen(false); }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-bg hover:text-fg"
          >
            <Type className="h-3.5 w-3.5" />
            {activeFontFamily}
            <ChevronDown className="h-3 w-3" />
          </button>
          <Popover open={fontFamilyOpen}>
            {FONT_FAMILIES.map((f) => (
              <button
                key={f.label}
                onClick={() => applyFontFamily(f.value, f.label)}
                className="block w-full px-3 py-1.5 text-left text-xs text-fg transition-colors hover:bg-bg-muted"
                style={{ fontFamily: f.value }}
              >
                {f.label}
              </button>
            ))}
          </Popover>
        </div>

        <div className="relative">
          <button
            onClick={() => { setFontSizeOpen((v) => !v); setFontFamilyOpen(false); }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-bg hover:text-fg"
          >
            Size
            <ChevronDown className="h-3 w-3" />
          </button>
          <Popover open={fontSizeOpen}>
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => applyFontSize(s)}
                className="block w-full px-3 py-1.5 text-left text-xs text-fg transition-colors hover:bg-bg-muted"
              >
                {s}
              </button>
            ))}
          </Popover>
        </div>

        {/* Color */}
        <div className="relative">
          <TB title="Text color" onClick={() => { setColorOpen((v) => !v); setHighlightOpen(false); }}>
            <Palette className="h-4 w-4" />
          </TB>
          <Popover open={colorOpen}>
            <div className="grid grid-cols-5 gap-1 p-2">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setTextColor(c)}
                  className="h-6 w-6 rounded-md border border-line-strong transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </Popover>
        </div>

        {/* Highlight */}
        <div className="relative">
          <TB title="Highlight" onClick={() => { setHighlightOpen((v) => !v); setColorOpen(false); }}>
            <Highlighter className="h-4 w-4" />
          </TB>
          <Popover open={highlightOpen}>
            <div className="grid grid-cols-4 gap-1 p-2">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setHighlight(c)}
                  className="h-6 w-6 rounded-md border border-line-strong transition-transform hover:scale-110"
                  style={{ backgroundColor: c === 'transparent' ? 'transparent' : c, backgroundImage: c === 'transparent' ? 'linear-gradient(45deg, transparent 45%, #dc2626 45%, #dc2626 55%, transparent 55%)' : undefined }}
                  title={c}
                />
              ))}
            </div>
          </Popover>
        </div>
        <Divider />

        {/* Alignment */}
        <TB title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft className="h-4 w-4" />
        </TB>
        <TB title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter className="h-4 w-4" />
        </TB>
        <TB title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight className="h-4 w-4" />
        </TB>
        <TB title="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
          <AlignJustify className="h-4 w-4" />
        </TB>
        <Divider />

        {/* Lists & structure */}
        <TB title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </TB>
        <TB title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </TB>
        <TB title="Checklist" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListChecks className="h-4 w-4" />
        </TB>
        <TB title="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </TB>
        <TB title="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code className="h-4 w-4" />
        </TB>
        <TB title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </TB>
        <Divider />

        {/* Links & media */}
        <TB title="Insert link" active={editor.isActive('link')} onClick={() => {
          const prev = editor.getAttributes('link').href || '';
          setLinkUrl(prev);
          setLinkOpen((v) => !v);
        }}>
          <LinkIcon className="h-4 w-4" />
        </TB>
        <TB title="Insert image" onClick={() => setImageOpen((v) => !v)}>
          <ImageIcon className="h-4 w-4" />
        </TB>
        <div className="relative">
          <TB title="Insert table" onClick={() => setTableOpen((v) => !v)}>
            <TableIcon className="h-4 w-4" />
          </TB>
          <Popover open={tableOpen}>
            <div className="p-3">
              <div className="mb-2 flex items-center gap-2">
                <label className="text-2xs font-medium text-fg-muted">Rows</label>
                <input type="number" min={1} max={10} value={tableRows} onChange={(e) => setTableRows(Math.max(1, Math.min(10, +e.target.value)))} className="w-12 rounded border border-line bg-bg px-1.5 py-0.5 text-xs text-fg focus:border-accent focus:outline-none" />
                <label className="text-2xs font-medium text-fg-muted">Cols</label>
                <input type="number" min={1} max={10} value={tableCols} onChange={(e) => setTableCols(Math.max(1, Math.min(10, +e.target.value)))} className="w-12 rounded border border-line bg-bg px-1.5 py-0.5 text-xs text-fg focus:border-accent focus:outline-none" />
              </div>
              <button onClick={insertTable} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs font-semibold text-accent-fg">
                <TableProperties className="h-3.5 w-3.5" /> Insert table
              </button>
            </div>
          </Popover>
        </div>

        {/* Table context controls */}
        {editor.isActive('table') && (
          <>
            <Divider />
            <TB title="Add row before" onClick={() => editor.chain().focus().addRowBefore().run()}>+R↑</TB>
            <TB title="Add row after" onClick={() => editor.chain().focus().addRowAfter().run()}>+R↓</TB>
            <TB title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>-R</TB>
            <TB title="Add column before" onClick={() => editor.chain().focus().addColumnBefore().run()}>+C←</TB>
            <TB title="Add column after" onClick={() => editor.chain().focus().addColumnAfter().run()}>+C→</TB>
            <TB title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>-C</TB>
            <TB title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>Del</TB>
          </>
        )}

        {/* Code view toggle */}
        <div className="ml-auto">
          <TB title="Toggle HTML source" active={showCode} onClick={() => {
            setCodeText(editor.getHTML());
            setShowCode(true);
          }}>
            <Code2 className="h-4 w-4" />
          </TB>
        </div>

        {/* Link modal */}
        <AnimatePresence>
          {linkOpen && (
            <ModalShell onClose={() => setLinkOpen(false)} title="Insert link">
              <input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setLink()}
                placeholder="https://"
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setLinkOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-bg-muted">Cancel</button>
                <button onClick={setLink} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg">
                  <Check className="h-3.5 w-3.5" /> Apply
                </button>
              </div>
            </ModalShell>
          )}
        </AnimatePresence>

        {/* Image modal */}
        <AnimatePresence>
          {imageOpen && (
            <ModalShell onClose={() => setImageOpen(false)} title="Insert image">
              <input
                autoFocus
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Image URL"
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="my-2 flex items-center gap-2 text-2xs text-fg-subtle">
                <span className="flex-1 border-t border-line" /> or upload <span className="flex-1 border-t border-line" />
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-bg px-3 py-3 text-sm text-fg-muted transition-colors hover:border-accent hover:text-fg">
                <ImageIcon className="h-4 w-4" />
                Choose a file
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setImageOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-bg-muted">Cancel</button>
                <button onClick={addImage} disabled={!imageUrl.trim()} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg disabled:opacity-40">
                  <Check className="h-3.5 w-3.5" /> Insert
                </button>
              </div>
            </ModalShell>
          )}
        </AnimatePresence>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ---- Sub components ----

function TB({
  children,
  title,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-accent-soft text-accent'
          : 'text-fg-muted hover:bg-bg hover:text-fg'
      } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px bg-line" />;
}

function Popover({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className="absolute left-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-line-strong bg-bg-subtle shadow-pop"
    >
      {children}
    </motion.div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-72 rounded-xl border border-line-strong bg-bg-subtle p-4 shadow-pop"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-fg">{title}</span>
          <button onClick={onClose} className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
