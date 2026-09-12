import { z } from 'zod';

/**
 * Validated environment contract (context/0_Phase.md §5 catalog).
 * Dev defaults keep the API bootable without infra; production turns the
 * auth secrets into required fields and rejects the dev convenience flags
 * (AGENTS.md locked constraint).
 */

const DEV_SECRET_PLACEHOLDER = 'phase0-dev-secret-change-me';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  DATABASE_URL: z
    .string()
    .default(
      'postgresql://postgres:postgres@localhost:5434/rentuz?schema=public&search_path=public,extensions',
    ),
  DATABASE_DIRECT_URL: z.string().default(
    'postgresql://postgres:postgres@localhost:5434/rentuz?search_path=public,extensions',
  ),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().default(DEV_SECRET_PLACEHOLDER),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SOCKET_TICKET_SECRET: z.string().default('phase0-dev-socket-secret'),

  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  STORAGE_ENDPOINT: z.string().default('http://localhost:9000'),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_ACCESS_KEY_ID: z.string().default('minioadmin'),
  STORAGE_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
  STORAGE_BUCKET_PUBLIC: z.string().default('rentuz-public'),
  STORAGE_BUCKET_PRIVATE: z.string().default('rentuz-private'),
  PUBLIC_STORAGE_BASE_URL: z.string().default('http://localhost:9000/rentuz-public'),

  SMS_PROVIDER: z.string().default('console'),
  AUTH_OTP_DEV_MODE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  AUTO_APPROVE_LISTINGS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  FX_RATES_URL: z.string().default('https://cbu.uz/oz/arkhiv-kursov-valyut/json/'),

  // Phase 6 §1.2.7 — notifications retention sweep (days).
  NOTIFICATIONS_READ_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  NOTIFICATIONS_UNREAD_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),
  SENTRY_DSN: z.string().default(''),

  ADMIN_PHONE: z.string().default('+998901234567'),
  ADMIN_INITIAL_PASSWORD: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export { envSchema };

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables: ${result.error.message}`);
  }
  const env = result.data;

  if (env.NODE_ENV === 'production') {
    if (env.JWT_ACCESS_SECRET === DEV_SECRET_PLACEHOLDER || env.JWT_ACCESS_SECRET.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be set to a strong value (>=32 chars) in production');
    }
    if (env.SOCKET_TICKET_SECRET.length < 32) {
      throw new Error('SOCKET_TICKET_SECRET must be set to a strong value (>=32 chars) in production');
    }
    // AGENTS.md: both are development conveniences with production startup assertions.
    if (env.AUTH_OTP_DEV_MODE) {
      throw new Error('AUTH_OTP_DEV_MODE must be false in production');
    }
    if (env.AUTO_APPROVE_LISTINGS) {
      throw new Error('AUTO_APPROVE_LISTINGS must be false in production');
    }
    if (env.SMS_PROVIDER === 'console') {
      // Not fatal (staging might still want console), but loud.
      console.warn('[config] SMS_PROVIDER=console in production — OTPs will not be delivered');
    }
  }

  return env;
}
