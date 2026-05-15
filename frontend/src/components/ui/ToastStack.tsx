'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type ToastKind = 'success' | 'info' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const kindStyles: Record<ToastKind, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  info: 'border-purple-500/30 bg-purple-500/10 text-purple-100',
  error: 'border-red-500/30 bg-red-500/10 text-red-100',
};

export function pushToast(t: Omit<ToastItem, 'id'>) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  document.dispatchEvent(
    new CustomEvent('nodewow:toast', { detail: { ...t, id } as ToastItem }),
  );
}

const noopSubscribe = () => () => {};

export function ToastStack() {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (!mounted) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent<ToastItem>).detail;
      setItems((prev) => [...prev, d].slice(-4));
      const ms = d.kind === 'error' ? 6000 : 4000;
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== d.id));
      }, ms);
    };
    document.addEventListener('nodewow:toast', handler);
    return () => document.removeEventListener('nodewow:toast', handler);
  }, [mounted]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 right-6 z-[200] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-[14px] border px-4 py-3 shadow-2xl backdrop-blur-xl animate-in ${kindStyles[t.kind]}`}
        >
          <p className="min-w-0 flex-1 text-[12px] leading-snug">{t.message}</p>
          <div className="flex shrink-0 items-center gap-1">
            {t.actionLabel && t.onAction && (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:bg-white/10"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
