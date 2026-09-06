import { z } from 'zod';

/**
 * Auth DTOs (spec §23–§24). Phone is E.164 Uzbekistan format
 * (§"Phone-first auth", 0_Phase.md §2). Password: NIST-style 12+ chars.
 */
export const UZ_PHONE = /^\+998\d{9}$/;

export const PHONE_FIELD = z.string().regex(UZ_PHONE, "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak");
export const PASSWORD_FIELD = z.string().min(12, 'Parol kamida 12 belgidan iborat bo‘lishi kerak').max(128);

export const RegisterInput = z.object({
  name: z.string().min(2, 'Ism kamida 2 belgi').max(80),
  phone: PHONE_FIELD,
  password: PASSWORD_FIELD,
  email: z.string().email().optional(),
});

export const LoginInput = z.object({
  phone: PHONE_FIELD,
  password: PASSWORD_FIELD,
});

export const VerifyPhoneInput = z.object({
  phone: PHONE_FIELD,
  code: z.string().regex(/^\d{5}$/, 'Kod 5 raqamdan iborat'),
  purpose: z.enum(['REGISTRATION', 'RESET']).default('REGISTRATION'),
});

export const ForgotPasswordInput = z.object({
  phone: PHONE_FIELD,
});

export const ResetPasswordInput = z.object({
  phone: PHONE_FIELD,
  code: z.string().regex(/^\d{5}$/, 'Kod 5 raqamdan iborat'),
  newPassword: PASSWORD_FIELD,
});

export type RegisterInputT = z.infer<typeof RegisterInput>;
export type LoginInputT = z.infer<typeof LoginInput>;
export type VerifyPhoneInputT = z.infer<typeof VerifyPhoneInput>;
export type ForgotPasswordInputT = z.infer<typeof ForgotPasswordInput>;
export type ResetPasswordInputT = z.infer<typeof ResetPasswordInput>;
