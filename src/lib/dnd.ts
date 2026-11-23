/** Drag and drop payloads. Mail ids and folder ids never leave the page. */
export const MAIL_MIME = 'application/x-typhoonpost-mail';
export const FOLDER_MIME = 'application/x-typhoonpost-folder';

export function startMailDrag(e: React.DragEvent, ids: string[]) {
  e.dataTransfer.setData(MAIL_MIME, JSON.stringify(ids));
  e.dataTransfer.setData('text/plain', `${ids.length} message${ids.length === 1 ? '' : 's'}`);
  e.dataTransfer.effectAllowed = 'move';
  const ghost = document.createElement('div');
  ghost.textContent = ids.length === 1 ? '1 message' : `${ids.length} messages`;
  ghost.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:6px 12px;border-radius:8px;background:#0f6cbd;color:#fff;font:600 13px system-ui';
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 12, 12);
  setTimeout(() => ghost.remove(), 0);
}

export const isMailDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(MAIL_MIME);
export const isFolderDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(FOLDER_MIME);

export function readMailDrag(e: React.DragEvent): string[] {
  try {
    const v = JSON.parse(e.dataTransfer.getData(MAIL_MIME));
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
