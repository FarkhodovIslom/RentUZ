'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Input } from '@rentuz/ui';
import { api, ApiError } from '@/lib/api';

/**
 * Phone verification with a 60s resend cooldown. Reads the dev OTP from the
 * register response when present (AUTH_OTP_DEV_MODE, dev/test only).
 */
export function VerifyPhoneForm({ initialDevCode }: { initialDevCode?: string }) {
  const t = useTranslations('auth.verify');
  const tErrors = useTranslations('auth.errors');
  const [code, setCode] = useState(initialDevCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Simple cooldown ticker (no external timer lib for this one component).
  if (cooldown > 0) {
    setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/verify-phone', { code, purpose: 'REGISTRATION' });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'UNAUTHORIZED' ? t('invalid') : tErrors('unknown'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ otpDev?: string }>('/auth/phone/resend', {});
      if (res?.otpDev) setCode(res.otpDev);
      setCooldown(60);
    } catch {
      setError(tErrors('unknown'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-fg-secondary">{t('subtitle')}</p>

      <Input
        id="verify-code"
        inputMode="numeric"
        label={t('placeholder')}
        placeholder="•••••"
        maxLength={5}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
        error={error ?? undefined}
      />

      <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 5}>
        {t('cta')}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full"
        disabled={cooldown > 0 || busy}
        onClick={resend}
      >
        {cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resend')}
      </Button>
    </form>
  );
}
