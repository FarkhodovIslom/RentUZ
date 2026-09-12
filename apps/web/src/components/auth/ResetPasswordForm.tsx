'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ResetPasswordInput, type ResetPasswordInputT } from '@rentuz/contracts';
import { Button, Input } from '@rentuz/ui';
import { api, ApiError } from '@/lib/api';

export function ResetPasswordForm() {
  const t = useTranslations('auth.reset');
  const tVerify = useTranslations('auth.verify');
  const tErrors = useTranslations('auth.errors');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInputT>({ resolver: zodResolver(ResetPasswordInput) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/auth/reset-password', values);
      router.push('/');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNAUTHORIZED')
        setFormError(tVerify('invalid'));
      else setFormError(tErrors('unknown'));
    }
  });

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <Input
        id="reset-phone"
        type="tel"
        label={tVerify('title')}
        placeholder="+998901234567"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Input
        id="reset-code"
        inputMode="numeric"
        label={t('code')}
        placeholder="•••••"
        maxLength={5}
        error={errors.code?.message}
        {...register('code')}
      />
      <Input
        id="reset-password"
        type="password"
        label={t('newPassword')}
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />

      {formError ? (
        <p role="alert" className="rounded-[12px] border border-error/40 bg-error/10 p-3 text-sm text-error">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        {isSubmitting ? tCommon('submitting') : t('cta')}
      </Button>
    </form>
  );
}
