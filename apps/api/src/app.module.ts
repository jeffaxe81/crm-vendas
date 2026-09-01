import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";

import { AuthModule } from "./auth/auth.module";
import { AuthorizationModule } from "./authorization/authorization.module";
import { parseApiEnvironment } from "./config/environment";
import { HealthModule } from "./health/health.module";
import { createLoggerOptions } from "./observability/logger.config";
import { RequestIdMiddleware } from "./observability/request-id.middleware";
import { OrganizationUsersModule } from "./users/organization-users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: parseApiEnvironment,
    }),
    LoggerModule.forRoot(createLoggerOptions()),
    HealthModule,
    AuthModule,
    AuthorizationModule,
    OrganizationUsersModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
