'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RegisterInput, type RegisterInputT } from '@rentuz/contracts';
import { Button, Input } from '@rentuz/ui';
import { api, ApiError } from '@/lib/api';

export function RegisterForm() {
  const t = useTranslations('auth.register');
  const tErrors = useTranslations('auth.errors');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInputT>({
    resolver: zodResolver(RegisterInput),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('/auth/register', values);
      router.push('/verify-phone');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFLICT') setFormError(t('taken'));
      else setFormError(tErrors('unknown'));
    }
  });

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <Input
        id="register-name"
        label={t('name')}
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        id="register-phone"
        type="tel"
        label={t('phone')}
        placeholder="+998901234567"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Input
        id="register-password"
        type="password"
        label={t('password')}
        error={errors.password?.message}
        {...register('password')}
      />
      <Input
        id="register-email"
        type="email"
        label={t('email')}
        error={errors.email?.message}
        {...register('email')}
      />

      {formError ? (
        <p role="alert" className="rounded-[12px] border border-error/40 bg-error/10 p-3 text-sm text-error">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        {isSubmitting ? tCommon('submitting') : t('cta')}
      </Button>

      <p className="text-sm text-fg-secondary">
        {t('haveAccount')}{' '}
        <a href="/login" className="text-primary hover:text-primary-hover">
          {t('login')}
        </a>
      </p>
    </form>
  );
}
