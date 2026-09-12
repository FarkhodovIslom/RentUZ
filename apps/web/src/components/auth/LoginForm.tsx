'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LoginInput, type LoginInputT } from '@rentuz/contracts';
import { Button, Input } from '@rentuz/ui';
import { api, ApiError } from '@/lib/api';

export function LoginForm() {
  const t = useTranslations('auth.login');
  const tErrors = useTranslations('auth.errors');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInputT>({
    resolver: zodResolver(LoginInput),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('/auth/login', values);
      // Drop the anonymous favorites probes (null) so the next mount
      // refetches with the real session (pending-favorite replay depends on it).
      queryClient.removeQueries({ queryKey: ['favorites'] });
      // Return to the page that required auth (pending favorite, etc.).
      const next = searchParams.get('next');
      router.push(next && next.startsWith('/') ? next : '/');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'RATE_LIMITED') setFormError(t('locked'));
        else setFormError(t('invalid'));
      } else {
        setFormError(tErrors('network'));
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <Input
        id="login-phone"
        type="tel"
        label={t('phone')}
        placeholder="+998901234567"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Input
        id="login-password"
        type="password"
        label={t('password')}
        error={errors.password?.message}
        {...register('password')}
      />

      {formError ? (
        <p role="alert" className="rounded-[12px] border border-error/40 bg-error/10 p-3 text-sm text-error">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        {isSubmitting ? tCommon('submitting') : t('cta')}
      </Button>

      <div className="flex flex-col gap-1 text-sm text-fg-secondary">
        <a href="/forgot-password" className="hover:text-fg">
          {t('forgot')}
        </a>
        <span>
          {t('noAccount')}{' '}
          <a href="/register" className="text-primary hover:text-primary-hover">
            {t('register')}
          </a>
        </span>
      </div>
    </form>
  );
}
