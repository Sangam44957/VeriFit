import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const config = app.get(AppConfigService);

  app.enableShutdownHooks();
  app.use(helmet());

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });

  if (config.apiDocsEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VeriFit API')
      .setDescription(
        'Candidate Evidence Intelligence & Company-Specific Placement Ranking Platform',
      )
      .setVersion('0.1.0')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.port);

  logger.log(`VeriFit API listening on port ${config.port}`);

  if (config.apiDocsEnabled) {
    logger.log(`Swagger available at http://localhost:${config.port}/api/docs`);
  }
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');

  logger.error(
    'Failed to bootstrap VeriFit API',
    error instanceof Error ? error.stack : String(error),
  );

  process.exit(1);
});
