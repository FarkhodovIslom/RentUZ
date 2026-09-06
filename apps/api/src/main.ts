import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { z } from 'zod';
import {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyPhoneInput,
} from '@rentuz/contracts';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(cookieParser());
  // Applies @Body({ schema: ZodSchema }) validation everywhere (§38 DTO validation).
  app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const corsOrigins = String(configService.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // /health and /ready stay outside the API prefix (§72; Render health path).
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });

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
    };
    for (const [path, schemaName] of Object.entries(bodyFor)) {
      const handler = authPaths[path]?.post;
      if (handler) {
        handler.requestBody = {
          content: { 'application/json': { schema: refOf(schemaName) } },
        } satisfies { content: Record<string, { schema?: unknown }> };
      }
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
