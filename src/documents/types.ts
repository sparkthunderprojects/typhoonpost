/** A ProseMirror document as JSON. Kept loose on purpose: the editor schema owns its shape. */
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export type PageSize = 'a4' | 'letter';

/** The encrypted body record. `v` lets later releases migrate old documents. */
export interface DocBody {
  v: 1;
  doc: PMNode;
  page: { size: PageSize };
}

/** The small encrypted record the list reads, so opening the list never decrypts a body. */
export interface DocMeta {
  title: string;
  excerpt: string;
  words: number;
}

export interface DocSummary extends DocMeta {
  id: string;
  starred: boolean;
  trashedAt: string | null;
  sizeBytes: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  undecryptable?: boolean;
}

export interface DocVersion {
  id: string;
  label: string | null;
  createdAt: string;
  title: string;
  words: number;
}

export const EMPTY_DOC: PMNode = { type: 'doc', content: [{ type: 'paragraph' }] };
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
