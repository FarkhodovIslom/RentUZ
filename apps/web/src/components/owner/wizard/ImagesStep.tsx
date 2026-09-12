'use client';

import { useRef, useState } from 'react';
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
 * Step 5 — image uploader. Sequential one-by-one uploads via XHR so the
 * progress bar and the abort button work (Phase 3 polish — plain fetch
 * streams through the BFF without progress events).
 */
export function ImagesStep({
  value,
  propertyId,
}: {
  value: WizardProperty;
  propertyId: string;
  /** WizardForm passes its updater; uploads are server-owned, so it is unused. */
  onChange?: (patch: Partial<WizardProperty>) => void;
}) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const abort = () => {
    xhrRef.current?.abort();
    xhrRef.current = null;
  };

  const upload = (file: File) => {
    if (images.length >= 15) {
      setError("Maksimum 15 ta rasm");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);

    // XHR (not fetch): onprogress + abort need it. The BFF path is the same.
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', `/api/v1/properties/${propertyId}/images`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      xhrRef.current = null;
      setBusy(false);
      try {
        const body = JSON.parse(xhr.responseText) as
          | { success: true; data: UploadedImage }
          | { success: false; message?: string };
        if (xhr.status >= 200 && xhr.status < 300 && body.success) {
          setImages((imgs) => [...imgs, body.data]);
        } else {
          setError(!body.success && body.message ? body.message : `Yuklash xatosi: ${xhr.status}`);
        }
      } catch {
        setError(`Yuklash xatosi: ${xhr.status}`);
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setBusy(false);
      setError('Tarmoq xatosi');
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setBusy(false);
      setProgress(0);
    };
    xhr.send(form);
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

      {busy ? (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Yuklanmoqda"
            className="h-2 overflow-hidden rounded-full bg-elevated"
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>{progress}%</span>
            <button type="button" onClick={abort} className="text-error hover:underline">
              Bekor qilish
            </button>
          </div>
        </div>
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
              if (f) upload(f);
            }}
          />
          {busy ? '…' : '+ qo‘shish'}
        </label>

        {images.map((img) => (
          <div key={img.id} className="group relative aspect-square overflow-hidden rounded-[12px] border border-border bg-elevated">
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
