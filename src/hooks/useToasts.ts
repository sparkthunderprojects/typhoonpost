import { useCallback, useRef, useState } from 'react';
import type { ToastItem } from '@/types';

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, actionLabel?: string, onAction?: () => void) => {
      const id = `t${idRef.current++}`;
      setToasts((prev) => [...prev, { id, message, actionLabel, onAction }]);
      window.setTimeout(() => dismiss(id), 6000);
      return id;
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}
