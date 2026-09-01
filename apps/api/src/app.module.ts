import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { parseApiEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseApiEnvironment,
    }),
    HealthModule,
  ],
})
export class AppModule {}
