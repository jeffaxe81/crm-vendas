import { Module } from "@nestjs/common";

import { DatabaseHealthService } from "./database-health.service";
import { PrismaService } from "./prisma.service";

@Module({
  providers: [PrismaService, DatabaseHealthService],
  exports: [PrismaService, DatabaseHealthService],
})
export class DatabaseModule {}
