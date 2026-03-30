import * as moduleAlias from 'module-alias';
moduleAlias.addAlias('@', __dirname);

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Security
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: [
      configService.get('FRONTEND_URL'),
      // Müşteri portali
      configService.get('CUSTOMER_PORTAL_URL'),
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // API prefix & versioning
  app.setGlobalPrefix(configService.get('API_PREFIX', 'api/v1'));

  // Global pipes — validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global interceptors (filters and logging handled by NestJS defaults)
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger — sadece dev/staging ortamında
  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PerKont API')
      .setDescription('Akredite İş Ekipmanları Periyodik Kontrol Yönetim Sistemi API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addTag('auth', 'Kimlik doğrulama')
      .addTag('users', 'Kullanıcı yönetimi')
      .addTag('customers', 'Müşteri yönetimi')
      .addTag('equipment', 'Ekipman yönetimi')
      .addTag('work-orders', 'İş emirleri')
      .addTag('inspections', 'Denetimler')
      .addTag('reports', 'Raporlar')
      .addTag('form-templates', 'Form şablonları')
      .addTag('sync', 'Offline senkronizasyon')
      .addTag('logo', 'LOGO ERP entegrasyonu')
      .addTag('notifications', 'Bildirimler')
      .addTag('admin', 'Admin yönetim paneli')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  logger.log(`🚀 PerKont API çalışıyor: http://localhost:${port}/api/v1`, 'Bootstrap');
  logger.log(`📚 Swagger: http://localhost:${port}/docs`, 'Bootstrap');
}

bootstrap();
