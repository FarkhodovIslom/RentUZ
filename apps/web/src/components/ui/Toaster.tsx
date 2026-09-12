'use client';

import { useEffect, useState } from 'react';

/**
 * Minimal toast surface (§19 "Saqlandi" feedback). No dependency: components
 * dispatch a `rentuz:toast` CustomEvent; the Toaster renders and auto-hides.
 */
export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('rentuz:toast', { detail: message }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);

  useEffect(() => {
    let counter = 0;
    const handler = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      const id = ++counter;
      setToasts((list) => [...list, { id, message }]);
      window.setTimeout(() => {
        setToasts((list) => list.filter((t) => t.id !== id));
      }, 2600);
    };
    window.addEventListener('rentuz:toast', handler);
    return () => window.removeEventListener('rentuz:toast', handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-[12px] border border-border bg-elevated px-4 py-2.5 text-sm font-medium text-fg shadow-lg"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
