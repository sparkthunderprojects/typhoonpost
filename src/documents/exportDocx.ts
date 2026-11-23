import type { PMNode } from './types';

/**
 * Word (.docx) export, built in the browser from the editor's JSON. The docx library is loaded only
 * when someone exports, so it never weighs on the rest of the app.
 */
type Docx = typeof import('docx');

const HEADINGS = ['HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6'] as const;

function dataUrlToBytes(src: string): { bytes: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const t = m[1].toLowerCase();
  return { bytes, type: t === 'jpeg' || t === 'jpg' ? 'jpg' : (t as 'png' | 'gif' | 'bmp') };
}

function hex(c: unknown): string | undefined {
  if (typeof c !== 'string') return undefined;
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  return m ? m[1].toUpperCase() : undefined;
}

export async function buildDocx(title: string, doc: PMNode, page: 'a4' | 'letter', imageSize: (src: string) => { w: number; h: number }): Promise<Blob> {
  const d: Docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, ImageRun, ExternalHyperlink, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, LevelFormat, BorderStyle, ShadingType } = d;

  const align = (a: unknown) =>
    a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : a === 'justify' ? AlignmentType.JUSTIFIED : undefined;

  const runs = (n: PMNode): (InstanceType<Docx['TextRun']> | InstanceType<Docx['ImageRun']> | InstanceType<Docx['ExternalHyperlink']>)[] => {
    const out: (InstanceType<Docx['TextRun']> | InstanceType<Docx['ImageRun']> | InstanceType<Docx['ExternalHyperlink']>)[] = [];
    for (const k of n.content ?? []) {
      if (k.type === 'hardBreak') out.push(new TextRun({ break: 1 }));
      else if (k.type === 'image') {
        const img = dataUrlToBytes(String(k.attrs?.src ?? ''));
        if (img) {
          const s = imageSize(String(k.attrs?.src));
          const w = Math.min(s.w || 400, 560);
          const h = Math.round(((s.h || 300) * w) / (s.w || 400));
          out.push(new ImageRun({ data: img.bytes, type: img.type, transformation: { width: w, height: h }, altText: { name: 'image', description: String(k.attrs?.alt ?? ''), title: '' } }));
        }
      } else if (k.type === 'text') {
        const marks = k.marks ?? [];
        const has = (m: string) => marks.some((x) => x.type === m);
        const ts = marks.find((x) => x.type === 'textStyle')?.attrs ?? {};
        const hl = marks.find((x) => x.type === 'highlight')?.attrs?.color;
        const size = typeof ts.fontSize === 'string' && /^\d+(\.\d+)?px$/.test(ts.fontSize) ? Math.round(parseFloat(ts.fontSize) * 1.5) : undefined;
        const run = new TextRun({
          text: k.text ?? '',
          bold: has('bold') || undefined,
          italics: has('italic') || undefined,
          underline: has('underline') ? {} : undefined,
          strike: has('strike') || undefined,
          subScript: has('subscript') || undefined,
          superScript: has('superscript') || undefined,
          color: hex(ts.color),
          size,
          font: typeof ts.fontFamily === 'string' ? ts.fontFamily.split(',')[0].replace(/["']/g, '').trim() : has('code') ? 'Courier New' : undefined,
          shading: hex(hl) ? { type: ShadingType.CLEAR, fill: hex(hl), color: 'auto' } : undefined,
        });
        const link = marks.find((x) => x.type === 'link');
        const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : '';
        out.push(/^(https?:|mailto:)/i.test(href) ? new ExternalHyperlink({ link: href, children: [run] }) : run);
      }
    }
    return out;
  };

  type Block = InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>;
  const para = (n: PMNode, extra: Record<string, unknown> = {}): InstanceType<Docx['Paragraph']> => {
    const style = n.attrs?.docStyle;
    const lh = Number(n.attrs?.lineHeight);
    return new Paragraph({
      children: runs(n),
      alignment: align(n.attrs?.textAlign),
      spacing: Number.isFinite(lh) && lh > 0 ? { line: Math.round(lh * 240) } : undefined,
      ...(style === 'title' ? { heading: HeadingLevel.TITLE } : style === 'subtitle' ? { style: 'Subtitle' } : {}),
      ...extra,
    } as ConstructorParameters<Docx['Paragraph']>[0]);
  };

  let listRef = 0;
  const cellBlocks = (c: PMNode, ctx: { level: number }): InstanceType<Docx['Paragraph']>[] => {
    const inner = blocks(c.content ?? [], ctx).filter((b): b is InstanceType<Docx['Paragraph']> => b instanceof Paragraph);
    return inner.length ? inner : [new Paragraph({})];
  };
  const numberings: { reference: string }[] = [];

  const blocks = (nodes: PMNode[], ctx: { level: number; ref?: string; quote?: boolean } = { level: 0 }): Block[] => {
    const out: Block[] = [];
    for (const n of nodes) {
      switch (n.type) {
        case 'paragraph':
          out.push(para(n, ctx.quote ? { indent: { left: 540 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } } } : {}));
          break;
        case 'heading': {
          const lvl = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)));
          out.push(para(n, { heading: HeadingLevel[HEADINGS[lvl - 1]] }));
          break;
        }
        case 'blockquote':
          out.push(...blocks(n.content ?? [], { ...ctx, quote: true }));
          break;
        case 'codeBlock':
          out.push(new Paragraph({ children: (n.content ?? []).map((k) => new TextRun({ text: k.text ?? '', font: 'Courier New', size: 20 })), shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } }));
          break;
        case 'horizontalRule':
          out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } } }));
          break;
        case 'image':
          out.push(new Paragraph({ children: runs({ type: 'p', content: [n] }) }));
          break;
        case 'bulletList':
        case 'orderedList':
        case 'taskList': {
          const ref = n.type === 'orderedList' ? `num-${listRef++}` : 'bullets';
          if (n.type === 'orderedList') numberings.push({ reference: ref });
          for (const li of n.content ?? []) {
            const kids = li.content ?? [];
            kids.forEach((c, i) => {
              if (c.type === 'bulletList' || c.type === 'orderedList' || c.type === 'taskList') out.push(...blocks([c], { level: Math.min(ctx.level + 1, 5) }));
              else if (i === 0 || c.type === 'paragraph') {
                const prefix = n.type === 'taskList' ? (li.attrs?.checked ? '☑ ' : '☐ ') : '';
                const p = para(c, n.type === 'taskList' ? { indent: { left: 360 + ctx.level * 360 } } : { numbering: { reference: ref, level: ctx.level } });
                if (prefix && i === 0) out.push(new Paragraph({ children: [new TextRun(prefix), ...runs(c)], indent: { left: 360 + ctx.level * 360 } }));
                else out.push(p);
              } else out.push(...blocks([c], ctx));
            });
          }
          break;
        }
        case 'table': {
          const rows = (n.content ?? []).map(
            (r) =>
              new TableRow({
                children: (r.content ?? []).map(
                  (c) =>
                    new TableCell({
                      children: cellBlocks(c, ctx),
                      columnSpan: Number(c.attrs?.colspan ?? 1) || 1,
                      rowSpan: Number(c.attrs?.rowspan ?? 1) || 1,
                      shading: hex(c.attrs?.backgroundColor) ? { type: ShadingType.CLEAR, fill: hex(c.attrs?.backgroundColor), color: 'auto' } : c.type === 'tableHeader' ? { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined,
                    }),
                ),
              }),
          );
          if (rows.length) out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
          out.push(new Paragraph({}));
          break;
        }
        default:
          if (n.content) out.push(...blocks(n.content, ctx));
      }
    }
    return out;
  };

  const children = blocks(doc.content ?? []);
  const bulletLevels = Array.from({ length: 6 }, (_, level) => ({
    level, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
  }));
  const numberLevels = Array.from({ length: 6 }, (_, level) => ({
    level, format: LevelFormat.DECIMAL, text: `%${level + 1}.`, alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
  }));

  const a4 = page === 'a4';
  const file = new Document({
    title,
    creator: 'Typhoonpost',
    numbering: { config: [{ reference: 'bullets', levels: bulletLevels }, ...numberings.map((nb) => ({ reference: nb.reference, levels: numberLevels }))] },
    sections: [{ properties: { page: { size: { width: a4 ? 11906 : 12240, height: a4 ? 16838 : 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: children.length ? children : [new Paragraph({})] }],
  });
  return Packer.toBlob(file);
}
