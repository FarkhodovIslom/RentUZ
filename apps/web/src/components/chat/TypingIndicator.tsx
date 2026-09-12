'use client';

/** §27 typing indicator — three animated dots under the counterpart's messages. */
export function TypingIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="flex items-center gap-1 px-1 py-1" aria-label="Yozmoqda...">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-muted [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-muted [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-muted [animation-delay:240ms]" />
    </div>
  );
}
