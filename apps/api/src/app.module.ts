import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";

import { ActivitiesModule } from "./activities/activities.module";
import { AuditAdminModule } from "./audit/audit-admin.module";
import { AuthModule } from "./auth/auth.module";
import { AuthorizationModule } from "./authorization/authorization.module";
import { CompaniesModule } from "./companies/companies.module";
import { parseApiEnvironment } from "./config/environment";
import { ContactsModule } from "./contacts/contacts.module";
import { CustomFieldsModule } from "./custom-fields/custom-fields.module";
import { HealthModule } from "./health/health.module";
import { createLoggerOptions } from "./observability/logger.config";
import { RequestIdMiddleware } from "./observability/request-id.middleware";
import { OpportunitiesModule } from "./opportunities/opportunities.module";
import { PipelinesModule } from "./pipelines/pipelines.module";
import { RelationshipsModule } from "./relationships/relationships.module";
import { TagsModule } from "./tags/tags.module";
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
    AuditAdminModule,
    AuthorizationModule,
    OrganizationUsersModule,
    CompaniesModule,
    ContactsModule,
    RelationshipsModule,
    TagsModule,
    CustomFieldsModule,
    PipelinesModule,
    ActivitiesModule,
    OpportunitiesModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
