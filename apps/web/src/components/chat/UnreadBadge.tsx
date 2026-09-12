'use client';

/** Unread count pill (§27) — RequestsBadge styling, capped at 99+. */
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-black">
      {label}
    </span>
  );
}
