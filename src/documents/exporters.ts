import { safeFileName, toMarkdown, toText } from './format';
import type { PMNode, PageSize } from './types';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const PAGE_CSS = (size: PageSize) => `
@page { size: ${size === 'a4' ? 'A4' : 'Letter'}; margin: 25.4mm; }
body { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #000; margin: 0; }
h1 { font-size: 20pt } h2 { font-size: 16pt } h3 { font-size: 14pt } h4 { font-size: 12pt } h5, h6 { font-size: 11pt }
h1, h2, h3, h4, h5, h6 { break-after: avoid; line-height: 1.25; margin: 1em 0 .4em }
p { margin: 0 0 .6em } blockquote { border-left: 3px solid #999; margin: 0 0 .6em; padding-left: 1em; color: #444 }
pre, code { font-family: 'Courier New', monospace } pre { background: #f2f2f2; padding: .6em; white-space: pre-wrap }
table { border-collapse: collapse; width: 100% } td, th { border: 1px solid #999; padding: 4px 6px; vertical-align: top } th { background: #f2f2f2 }
img { max-width: 100%; height: auto } hr { border: 0; border-top: 1px solid #999 }
ul[data-type=taskList] { list-style: none; padding-left: 0 } ul[data-type=taskList] li { display: flex; gap: .5em }
p[data-doc-style=title] { font-size: 26pt; line-height: 1.2 } p[data-doc-style=subtitle] { font-size: 14pt; color: #555 }
`;

export function htmlDocument(title: string, bodyHtml: string, size: PageSize): string {
  const esc = title.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc}</title><style>${PAGE_CSS(size)}</style></head><body>${bodyHtml}</body></html>`;
}

export function exportHtml(title: string, bodyHtml: string, size: PageSize) {
  download(new Blob([htmlDocument(title, bodyHtml, size)], { type: 'text/html;charset=utf-8' }), `${safeFileName(title)}.html`);
}
export function exportText(title: string, doc: PMNode) {
  download(new Blob([toText(doc) + '\n'], { type: 'text/plain;charset=utf-8' }), `${safeFileName(title)}.txt`);
}
export function exportMarkdown(title: string, doc: PMNode) {
  download(new Blob([toMarkdown(doc)], { type: 'text/markdown;charset=utf-8' }), `${safeFileName(title)}.md`);
}

function imageSizes(doc: PMNode): Promise<Map<string, { w: number; h: number }>> {
  const srcs = new Set<string>();
  const walk = (n: PMNode) => {
    if (n.type === 'image' && typeof n.attrs?.src === 'string') srcs.add(n.attrs.src);
    n.content?.forEach(walk);
  };
  walk(doc);
  const map = new Map<string, { w: number; h: number }>();
  return Promise.all(
    [...srcs].map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => { map.set(src, { w: img.naturalWidth, h: img.naturalHeight }); resolve(); };
          img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  ).then(() => map);
}

/** The Word file for a document, without saving it anywhere. Used to attach a Doc to a message. */
export async function docxBlob(title: string, doc: PMNode, size: PageSize): Promise<Blob> {
  const [{ buildDocx }, sizes] = await Promise.all([import('./exportDocx'), imageSizes(doc)]);
  return buildDocx(title, doc, size, (src) => sizes.get(src) ?? { w: 400, h: 300 });
}

export async function exportDocx(title: string, doc: PMNode, size: PageSize) {
  const blob = await docxBlob(title, doc, size);
  download(blob, `${safeFileName(title)}.docx`);
}

/** PDF without any server: the browser's own "Save as PDF" in the print dialog. */
export function printDocument(title: string, bodyHtml: string, size: PageSize) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const win = frame.contentWindow!;
  win.document.open();
  win.document.write(htmlDocument(title, bodyHtml, size));
  win.document.close();
  const run = () => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 1000);
  };
  const imgs = [...win.document.images];
  Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = () => r(null); })))).then(run);
}
