import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNodeT } from '@tiptap/pm/model';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docFontSize: { setFontSize: (size: string) => ReturnType; unsetFontSize: () => ReturnType };
    docStyle: { setDocStyle: (style: 'title' | 'subtitle' | null) => ReturnType; setLineHeight: (h: string | null) => ReturnType };
    docSearch: {
      setSearch: (term: string, caseSensitive: boolean, wholeWord: boolean) => ReturnType;
      stepSearch: (dir: 1 | -1) => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
    };
  }
}

/** Font size as a textStyle attribute. Written for Documents; the mail composer has its own. */
export const DocFontSize = Extension.create({
  name: 'docFontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (a) => (a.fontSize ? { style: `font-size: ${a.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

/** Named paragraph styles (Title, Subtitle) and line spacing. Headings come from the heading node. */
export const DocParagraphStyle = Extension.create({
  name: 'docParagraphStyle',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        docStyle: {
          default: null,
          parseHTML: (el) => el.getAttribute('data-doc-style'),
          renderHTML: (a) => (a.docStyle ? { 'data-doc-style': a.docStyle } : {}),
        },
        lineHeight: {
          default: null,
          parseHTML: (el) => el.style.lineHeight || null,
          renderHTML: (a) => (a.lineHeight ? { style: `line-height: ${a.lineHeight}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setDocStyle: (style) => ({ chain }) => chain().setParagraph().updateAttributes('paragraph', { docStyle: style }).run(),
      setLineHeight: (h) => ({ commands }) =>
        commands.updateAttributes('paragraph', { lineHeight: h }) && commands.updateAttributes('heading', { lineHeight: h }),
    };
  },
});

// ---------------------------------------------------------------------------
// Find and replace, entirely in the browser
// ---------------------------------------------------------------------------

interface SearchState { term: string; caseSensitive: boolean; wholeWord: boolean; matches: { from: number; to: number }[]; index: number }
export const searchKey = new PluginKey<SearchState>('docSearch');

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

export function findMatches(doc: PMNodeT, term: string, caseSensitive: boolean, wholeWord: boolean) {
  const out: { from: number; to: number }[] = [];
  if (!term) return out;
  const needle = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = caseSensitive ? node.text : node.text.toLowerCase();
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) {
      const end = i + needle.length;
      if (!wholeWord || (!isWordChar(hay[i - 1]) && !isWordChar(hay[end]))) out.push({ from: pos + i, to: pos + end });
      i = end;
    }
  });
  return out;
}

export const DocSearch = Extension.create({
  name: 'docSearch',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => ({ term: '', caseSensitive: false, wholeWord: false, matches: [], index: 0 }),
          apply(tr, prev) {
            const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
            let s = meta ? { ...prev, ...meta } : prev;
            if (meta || tr.docChanged) {
              const matches = findMatches(tr.doc, s.term, s.caseSensitive, s.wholeWord);
              s = { ...s, matches, index: Math.min(s.index, Math.max(matches.length - 1, 0)) };
            }
            return s;
          },
        },
        props: {
          decorations(state) {
            const s = searchKey.getState(state);
            if (!s || !s.matches.length) return DecorationSet.empty;
            return DecorationSet.create(state.doc, s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.index ? 'doc-find doc-find-current' : 'doc-find' })));
          },
        },
      }),
    ];
  },
  addCommands() {
    return {
      setSearch: (term, caseSensitive, wholeWord) => ({ tr, dispatch }) => {
        dispatch?.(tr.setMeta(searchKey, { term, caseSensitive, wholeWord, index: 0 }));
        return true;
      },
      stepSearch: (dir) => ({ state, tr, dispatch }) => {
        const s = searchKey.getState(state);
        if (!s || !s.matches.length) return false;
        const index = (s.index + dir + s.matches.length) % s.matches.length;
        const m = s.matches[index];
        dispatch?.(tr.setMeta(searchKey, { index }).setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView());
        return true;
      },
      replaceCurrent: (replacement) => ({ state, tr, dispatch }) => {
        const s = searchKey.getState(state);
        if (!s || !s.matches.length) return false;
        const m = s.matches[s.index];
        dispatch?.(tr.insertText(replacement, m.from, m.to));
        return true;
      },
      replaceAll: (replacement) => ({ state, tr, dispatch }) => {
        const s = searchKey.getState(state);
        if (!s || !s.matches.length) return false;
        [...s.matches].reverse().forEach((m) => tr.insertText(replacement, m.from, m.to));
        dispatch?.(tr);
        return true;
      },
    };
  },
});
