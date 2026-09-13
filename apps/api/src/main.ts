import 'reflect-metadata';
import * as Sentry from '@sentry/nestjs';
import { Logger } from '@nestjs/common';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { z } from 'zod';
import {
  CreateConversationInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  SendMessageInput,
  VerifyPhoneInput,
} from '@rentuz/contracts';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter.js';

/** §99 PII scrub for outbound Sentry events (8_Phase.md §5). */
const SENTRY_PII_KEYS = new Set([
  'phone',
  'phonenumber',
  'email',
  'password',
  'passwordhash',
  'tokenhash',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'otp',
  'otpdev',
]);

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENTRY_PII_KEYS.has(key.toLowerCase()) ? '***' : scrubValue(val);
    }
    return out;
  }
  if (typeof value === 'string' && /^\+998\d{9}$/.test(value)) return '***';
  return value;
}

type Scrubbable = {
  user?: Record<string, unknown>;
  request?: { headers?: unknown; data?: unknown };
  extra?: Record<string, unknown>;
  [key: string]: unknown;
};

const SentryScrub = {
  scrub(eventIn: unknown): unknown {
    const event = eventIn as Scrubbable;
    if (event.user) {
      delete event.user.email;
      delete event.user.phoneNumber;
      delete event.user.ip_address;
    }
    if (event.request) {
      delete event.request.headers;
      if (typeof event.request.data === 'object' && event.request.data !== null) {
        event.request.data = scrubValue(event.request.data);
      }
    }
    if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
    return event;
  },
};

async function bootstrap(): Promise<void> {
  // §71/§72: LOG_TRANSPORT=production pipes Nest's Logger into pino with a
  // JSON-disk transport (the aggregator's collector picks it up); otherwise
  // the console logger stays as-is (dev/CI keep readable output).
  if (process.env.LOG_TRANSPORT === 'production') {
    const { pino } = await import('pino');
    const logger = pino({
      level: process.env.LOG_LEVEL ?? 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: ['req.headers.authorization', 'passwordHash', '*.phone', '*.email'],
    });
    Logger.overrideLogger(logger as unknown as Console);
  }

  // Sentry (8_Phase.md §1.5 item 31) — DSN-gated: no DSN, no SDK. Init before
  // the app starts so boot errors capture too. PII scrub: phone/email/
  // passwordHash/tokenHash/Authorization never leave the process (§99).
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      release: process.env.RENDER_GIT_COMMIT ?? 'dev',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      sendDefaultPii: false,
      beforeSend(event) {
        return SentryScrub.scrub(event) as typeof event;
      },
    });
  }

  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(cookieParser());
  // Applies @Body({ schema: ZodSchema }) validation everywhere (§38 DTO validation).
  app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
  app.enableShutdownHooks();
  // Phase 5: socket.io rides the same HTTP server; the adapter is a no-op
  // unless RENTUZ_REALTIME_SCALE > 1 (multi-instance pub/sub fanout).
  app.useWebSocketAdapter(new RedisIoAdapter(app));

  const configService = app.get(ConfigService);
  const corsOrigins = String(configService.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // /health and /ready stay outside the API prefix (§72; Render health path).
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready', 'metrics'] });

  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('RentUZ API')
      .setDescription('RentUZ MVP REST API')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    // OpenAPI request schemas (Phase 0 spike outcome): @nestjs/swagger 12 does
    // not surface Standard Schema bodies through createDocument. Zod 4's
    // native z.toJSONSchema() covers the gap without an extra dependency —
    // schemas are registered into components and referenced from the auth
    // paths (0_Phase.md §1 trap 1 fallback, resolved in Phase 1).
    const dtoSchemas: Record<string, z.ZodType> = {
      RegisterInput,
      LoginInput,
      VerifyPhoneInput,
      ForgotPasswordInput,
      ResetPasswordInput,
      CreateConversationInput,
      SendMessageInput,
    };
    document.components = {
      ...(document.components ?? {}),
      schemas: {
        ...((document.components as { schemas?: Record<string, unknown> })?.schemas ?? {}),
        ...Object.fromEntries(
          Object.entries(dtoSchemas).map(([name, schema]) => {
            const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
            return [name, jsonSchema];
          }),
        ),
      },
    } as typeof document.components;
    // Attach the schema refs to their auth request bodies.
    const refOf = (name: string) => ({ $ref: `#/components/schemas/${name}` });
    const authPaths = document.paths as Record<string, Record<string, { requestBody?: { content: Record<string, { schema?: unknown }> } }>>;
    const bodyFor: Record<string, string> = {
      '/api/v1/auth/register': 'RegisterInput',
      '/api/v1/auth/login': 'LoginInput',
      '/api/v1/auth/verify-phone': 'VerifyPhoneInput',
      '/api/v1/auth/forgot-password': 'ForgotPasswordInput',
      '/api/v1/auth/reset-password': 'ResetPasswordInput',
      '/api/v1/conversations': 'CreateConversationInput',
    };
    for (const [path, schemaName] of Object.entries(bodyFor)) {
      const handler = authPaths[path]?.post;
      if (handler) {
        handler.requestBody = {
          content: { 'application/json': { schema: refOf(schemaName) } },
        } satisfies { content: Record<string, { schema?: unknown }> };
      }
    }
    // Chat message send bodies (nested path).
    const sendMessageHandler = authPaths['/api/v1/conversations/{id}/messages']?.post;
    if (sendMessageHandler) {
      sendMessageHandler.requestBody = {
        content: { 'application/json': { schema: refOf('SendMessageInput') } },
      } satisfies { content: Record<string, { schema?: unknown }> };
    }

    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(configService.get<number>('PORT') ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(
    `RentUZ API listening on :${port} (env: ${configService.get('NODE_ENV')})`,
  );
}

void bootstrap();
