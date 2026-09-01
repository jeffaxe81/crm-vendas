import {
  MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { parseApiEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { createLoggerOptions } from './observability/logger.config';
import { RequestIdMiddleware } from './observability/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseApiEnvironment,
    }),
    LoggerModule.forRoot(createLoggerOptions()),
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
