import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";

import { ActivitiesModule } from "./activities/activities.module";
import { AuditAdminModule } from "./audit/audit-admin.module";
import { AuthModule } from "./auth/auth.module";
import { AuthorizationModule } from "./authorization/authorization.module";
import { CompanyImportModule } from "./company-imports/company-import.module";
import { ContactImportModule } from "./contact-imports/contact-import.module";
import { ProductImportModule } from "./product-imports/product-import.module";
import { ProductsModule } from "./products/products.module";
import { TicketsModule } from "./tickets/tickets.module";
import { CompaniesModule } from "./companies/companies.module";
import { parseApiEnvironment } from "./config/environment";
import { ContactsModule } from "./contacts/contacts.module";
import { CustomFieldsModule } from "./custom-fields/custom-fields.module";
import { HealthModule } from "./health/health.module";
import { createLoggerOptions } from "./observability/logger.config";
import { ObservabilityModule } from "./observability/observability.module";
import { RequestIdMiddleware } from "./observability/request-id.middleware";
import { OpportunitiesModule } from "./opportunities/opportunities.module";
import { PipelinesModule } from "./pipelines/pipelines.module";
import { RelationshipsModule } from "./relationships/relationships.module";
import { ReportsModule } from "./reports/reports.module";
import { TagsModule } from "./tags/tags.module";
import { OrganizationUsersModule } from "./users/organization-users.module";
import { SlaModule } from "./sla/sla.module";

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
    ObservabilityModule,
    OrganizationUsersModule,
    CompaniesModule,
    CompanyImportModule,
    ContactImportModule,
    ProductsModule,
    TicketsModule,
    ProductImportModule,
    ContactsModule,
    RelationshipsModule,
    TagsModule,
    CustomFieldsModule,
    PipelinesModule,
    ActivitiesModule,
    OpportunitiesModule,
    ReportsModule,
    SlaModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
