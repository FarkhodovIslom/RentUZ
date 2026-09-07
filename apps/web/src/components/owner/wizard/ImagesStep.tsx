'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { WizardProperty } from './WizardForm';

interface UploadedImage {
  id: string;
  url: string;
  thumbUrl: string | null;
  width: number;
  height: number;
  ordering: number;
}

/**
 * Step 5 — image uploader. Sequential one-by-one uploads via fetch (no
 * XHR progress this minimal version, Phase 3+ can add); preview + delete wired.
 */
export function ImagesStep({
  value,
  propertyId,
}: {
  value: WizardProperty;
  propertyId: string;
}) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (images.length >= 15) {
      setError("Maksimum 15 ta rasm");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      // We hit the BFF directly with FormData; api.post can't (JSON-only).
      const res = await fetch(`/api/v1/properties/${propertyId}/images`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? `Yuklash xatosi: ${res.status}`);
      }
      const created = (await res.json()) as UploadedImage;
      setImages((imgs) => [...imgs, created]);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Yuklashda xatolik');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.del(`/properties/${propertyId}/images/${id}`);
      setImages((imgs) => imgs.filter((i) => i.id !== id));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Rasmlar</h2>
      <p className="text-sm text-fg-secondary">
        Maksimal 15 ta rasm. JPEG/PNG/WebP, 640×480 minimal, 10 MB.
      </p>

      {error ? (
        <p className="rounded-[12px] border border-error/40 bg-error/10 p-3 text-sm text-error">{error}</p>
      ) : null}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <label className="flex aspect-square cursor-pointer items-center justify-center rounded-[12px] border-2 border-dashed border-border bg-card text-sm text-fg-muted hover:border-primary hover:text-fg">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy || images.length >= 15}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          {busy ? '...' : '+ qo‘shish'}
        </label>

        {images.map((img) => (
          <div key={img.id} className="group relative aspect-square overflow-hidden rounded-[12px] border border-border bg-elevated">
            {}
            <img src={img.thumbUrl ?? img.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(img.id)}
              className="absolute right-1 top-1 rounded-full bg-error/90 px-2 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* The state doesn't carry images; the server holds the source of truth. */}
      <input type="hidden" value={value.amenities.join(',')} onChange={() => undefined} />
    </div>
  );
}
