import {
  FileText,
  Image as ImageIcon,
  Presentation,
  Sheet,
  File as FileIcon,
} from 'lucide-react';
import type { Attachment } from '@/types';

export function AttachmentIcon({ kind, className = '' }: { kind: Attachment['kind']; className?: string }) {
  const map = {
    pdf: { Icon: FileText, color: 'text-danger' },
    doc: { Icon: FileText, color: 'text-accent' },
    image: { Icon: ImageIcon, color: 'text-success' },
    slide: { Icon: Presentation, color: 'text-warning' },
    sheet: { Icon: Sheet, color: 'text-success' },
  } as const;
  const { Icon, color } = map[kind] ?? { Icon: FileIcon, color: 'text-fg-muted' };
  return <Icon className={`${color} ${className}`} />;
}
