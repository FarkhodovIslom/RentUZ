import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
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
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(configService.get<number>('PORT') ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(
    `RentUZ API listening on :${port} (env: ${configService.get('NODE_ENV')})`,
  );
}

void bootstrap();
