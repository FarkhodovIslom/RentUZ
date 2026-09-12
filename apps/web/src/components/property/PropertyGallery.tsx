'use client';

import { useEffect, useState } from 'react';

interface GalleryImage {
  id: string;
  url: string;
  width: number;
  height: number;
}

/**
 * §20 gallery — desktop: primary + 4-up thumbnails; mobile: swipeable single
 * image. Click opens a fullscreen lightbox with keyboard navigation.
 */
export function PropertyGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? null : (i + 1) % images.length));
      if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? null : (i - 1 + images.length) % images.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, images.length]);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-[16px] border border-border bg-elevated text-fg-muted">
        Rasm yo&apos;q
      </div>
    );
  }

  const thumbs = images.slice(1, 5);

  return (
    <div>
      <div className="grid gap-2 lg:grid-cols-[2fr_1fr]">
        <button
          type="button"
          onClick={() => setLightbox(0)}
          aria-label="Rasmlarni kattalashtirish"
          className="relative aspect-[4/3] overflow-hidden rounded-[16px] bg-elevated lg:aspect-auto lg:min-h-[420px]"
        >
          <img src={images[0].url} alt={title} className="h-full w-full object-cover" />
        </button>
        {thumbs.length > 0 ? (
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
            {thumbs.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightbox(i + 1)}
                aria-label={`Rasm ${i + 2}`}
                className="relative aspect-[4/3] overflow-hidden rounded-[12px] bg-elevated"
              >
                <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                {i === 3 && images.length > 5 ? (
                  <span className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-semibold text-white">
                    +{images.length - 5}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Mobile thumbnails */}
      <div className="mt-2 flex gap-2 overflow-x-auto lg:hidden">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Rasm ${i + 1}`}
            aria-current={i === active}
            className={`aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-[8px] border-2 ${
              i === active ? 'border-primary' : 'border-transparent'
            }`}
          >
            <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>

      {lightbox !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rasm ko'rish"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button type="button" aria-label="Yopish" onClick={() => setLightbox(null)} className="absolute right-4 top-4 p-2 text-white/80 hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          {images.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Oldingi rasm"
                onClick={() => setLightbox((lightbox - 1 + images.length) % images.length)}
                className="absolute left-4 p-2 text-white/80 hover:text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8" aria-hidden>
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Keyingi rasm"
                onClick={() => setLightbox((lightbox + 1) % images.length)}
                className="absolute right-4 p-2 text-white/80 hover:text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8" aria-hidden>
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
          ) : null}
          <img
            src={images[lightbox].url}
            alt={title}
            className="max-h-[85dvh] max-w-full rounded-[12px] object-contain"
          />
          <span className="absolute bottom-4 rounded-full bg-bg/80 px-3 py-1 text-xs text-fg-secondary">
            {lightbox + 1} / {images.length}
          </span>
        </div>
      ) : null}
    </div>
  );
}
