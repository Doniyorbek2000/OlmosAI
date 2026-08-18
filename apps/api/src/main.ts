import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { VeyraExceptionFilter } from './common/veyra-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.env.WEB_URL,
    credentials: true,
  });
  // External developer API is /v1; internal UI API is /api/v1 (proxy adds /api).
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new VeyraExceptionFilter());
  app.enableShutdownHooks();

  const port = config.env.API_PORT;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[${config.branding.name}] API listening on :${port}`);
}

void bootstrap();
