'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@rentuz/ui';
import { api, ApiError } from '@/lib/api';
import { BasicStep } from './BasicStep';
import { AddressStep } from './AddressStep';
import { PriceStep } from './PriceStep';
import { AmenitiesStep } from './AmenitiesStep';
import { ImagesStep } from './ImagesStep';
import { DescriptionStep } from './DescriptionStep';
import { PreviewStep } from './PreviewStep';

export interface WizardProperty {
  id: string;
  title: string;
  description: string;
  type: string;
  price: number;
  currency: string;
  rooms: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  address: string;
  regionId: string | null;
  districtId: string | null;
  lng: number | null;
  lat: number | null;
  furnished: string;
  petsAllowed: boolean;
  smokingAllowed: boolean;
  amenities: string[];
  status: string;
}

const STEPS = ['basic', 'address', 'price', 'amenities', 'images', 'description', 'preview'] as const;

/**
 * 7-step property wizard (§32). Each step calls `onSave` which PATCHes the
 * draft and advances. Final step submits.
 *
 * Map pin and image upload happen via their own components (AddressStep
 * delegates to MapPinPicker, ImagesStep to ImageUploader). Submit + Save
 * Draft are always reachable; only the final "Yuborish" triggers submit.
 */
export function WizardForm({
  initial,
  propertyId,
}: {
  initial: WizardProperty;
  propertyId: string;
}) {
  const t = useTranslations('wizard');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (patch: Partial<WizardProperty>) => setData((d) => ({ ...d, ...patch }));

  const saveDraft = async (): Promise<boolean> => {
    setError(null);
    try {
      await api.patch(`/properties/${propertyId}`, data);
      return true;
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(t('validation'));
      return false;
    }
  };

  const onNext = async () => {
    const ok = await saveDraft();
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const onBack = () => setStep((s) => Math.max(0, s - 1));

  const onSubmit = async () => {
    setError(null);
    startTransition(async () => {
      try {
        await api.patch(`/properties/${propertyId}`, data);
        await api.post(`/properties/${propertyId}/submit`);
        router.push('/owner/properties');
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        else setError(t('validation'));
      }
    });
  };

  return (
    <div className="space-y-6">
      <StepIndicator current={step} />

      {error ? (
        <p
          role="alert"
          className="rounded-[12px] border border-error/40 bg-error/10 p-3 text-sm text-error"
        >
          {error}
        </p>
      ) : null}

      <div className="rounded-[12px] border border-border bg-card p-6">
        {step === 0 ? <BasicStep value={data} onChange={update} /> : null}
        {step === 1 ? <AddressStep value={data} onChange={update} /> : null}
        {step === 2 ? <PriceStep value={data} onChange={update} /> : null}
        {step === 3 ? <AmenitiesStep value={data} onChange={update} /> : null}
        {step === 4 ? <ImagesStep value={data} onChange={update} propertyId={propertyId} /> : null}
        {step === 5 ? <DescriptionStep value={data} onChange={update} /> : null}
        {step === 6 ? <PreviewStep value={data} /> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={step === 0 || pending}>
          {t('back')}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const ok = await saveDraft();
              if (ok) router.push('/owner/properties');
            }}
            disabled={pending}
          >
            {t('saveDraft')}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={onNext} loading={pending}>
              {t('next')}
            </Button>
          ) : (
            <Button onClick={onSubmit} loading={pending}>
              {t('submit')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  const t = useTranslations('wizard.steps');
  return (
    <ol className="flex flex-wrap gap-1.5 text-xs">
      {STEPS.map((stepKey, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li
            key={stepKey}
            className={[
              'rounded-full px-3 py-1.5',
              active
                ? 'bg-primary/20 font-semibold text-primary'
                : done
                  ? 'bg-success/15 text-success'
                  : 'bg-elevated text-fg-muted',
            ].join(' ')}
            aria-current={active ? 'step' : undefined}
          >
            {i + 1}. {t(stepKey)}
          </li>
        );
      })}
    </ol>
  );
}
