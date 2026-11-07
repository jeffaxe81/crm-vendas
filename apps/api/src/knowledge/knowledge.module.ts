import { Module } from "@nestjs/common";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";
import { LocalKnowledgeStorage } from "./local-knowledge-storage";

export const KNOWLEDGE_STORAGE = Symbol("KNOWLEDGE_STORAGE");

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    {
      provide: KNOWLEDGE_STORAGE,
      useFactory: () => {
        const root = process.env.KNOWLEDGE_STORAGE_ROOT;
        if (!root && process.env.NODE_ENV === "production") {
          throw new Error("KNOWLEDGE_STORAGE_ROOT_REQUIRED");
        }
        return new LocalKnowledgeStorage(
          root ?? join(tmpdir(), "axes-crm-knowledge-test")
        );
      },
    },
  ],
})
export class KnowledgeModule {}
