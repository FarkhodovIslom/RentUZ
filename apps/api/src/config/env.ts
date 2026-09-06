import { z } from 'zod';

/**
 * Validated environment contract. Phase 0 keeps dev defaults so the API boots
 * without infra; Phase 1 turns auth secrets into required fields.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  DATABASE_URL: z
    .string()
    .default(
      'postgresql://postgres:postgres@localhost:5432/rentuz?schema=public&search_path=public,extensions',
    ),
  DATABASE_DIRECT_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/rentuz'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().default('phase0-dev-secret-change-me'),
  SOCKET_TICKET_SECRET: z.string().default('phase0-dev-socket-secret'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables: ${result.error.message}`);
  }
  return result.data;
}
