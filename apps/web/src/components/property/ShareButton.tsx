'use client';

import { toast } from '@/components/ui/Toaster';

/** navigator.share with a clipboard fallback (§20). */
export function ShareButton({ title, url }: { title: string; url: string }) {
  const onShare = async () => {
    const absolute = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url: absolute });
        return;
      }
      throw new Error('no-share');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(absolute);
        toast('Havola nusxalandi');
      } catch {
        toast('Havolani nusxalab bo‘lmadi');
      }
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-border bg-card px-4 text-sm font-medium hover:border-primary"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.59 13.51 6.83 3.98m-.01-10.98-6.82 3.98" />
      </svg>
      Ulashish
    </button>
  );
}
