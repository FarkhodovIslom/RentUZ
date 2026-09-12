'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ForgotPasswordInput, type ForgotPasswordInputT } from '@rentuz/contracts';
import { Button, Input } from '@rentuz/ui';
import { api } from '@/lib/api';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const tCommon = useTranslations('common');
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInputT>({ resolver: zodResolver(ForgotPasswordInput) });

  const onSubmit = handleSubmit(async (values) => {
    // Always resolves 200 (no user enumeration) — show the same message.
    await api.post('/auth/forgot-password', values).catch(() => null);
    setSent(true);
  });

  if (sent) {
    return (
      <div className="w-full max-w-sm space-y-2 text-center">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-fg-secondary">{t('sent')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-fg-secondary">{t('subtitle')}</p>
      <Input
        id="forgot-phone"
        type="tel"
        label={t('subtitle')}
        placeholder="+998901234567"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Button type="submit" className="w-full" loading={isSubmitting}>
        {isSubmitting ? tCommon('submitting') : t('cta')}
      </Button>
    </form>
  );
}
