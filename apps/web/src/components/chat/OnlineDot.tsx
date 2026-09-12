'use client';

/** §27 online dot — green when the counterpart has a live socket, muted otherwise. */
export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      aria-label={online ? 'Onlayn' : 'Offlayn'}
      title={online ? 'Onlayn' : 'Offlayn'}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
        online ? 'bg-emerald-400' : 'bg-fg-muted/40'
      }`}
    />
  );
}
