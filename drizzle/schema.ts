import {
  date,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const clients = mysqlTable(
  "clients",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["person", "company"]).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    document: varchar("document", { length: 32 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    city: varchar("city", { length: 120 }),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdById: int("createdById").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    inactivatedAt: timestamp("inactivatedAt"),
  },
  table => [
    index("clients_status_idx").on(table.status),
    index("clients_name_idx").on(table.name),
    index("clients_document_idx").on(table.document),
  ],
);

export const contacts = mysqlTable(
  "contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("clientId").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    jobTitle: varchar("jobTitle", { length: 120 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    isPrimary: mysqlEnum("isPrimary", ["yes", "no"]).default("no").notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdById: int("createdById").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    inactivatedAt: timestamp("inactivatedAt"),
  },
  table => [index("contacts_client_idx").on(table.clientId), index("contacts_status_idx").on(table.status)],
);

export const opportunities = mysqlTable(
  "opportunities",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("clientId").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    estimatedValue: decimal("estimatedValue", { precision: 14, scale: 2 }).default("0").notNull(),
    stage: mysqlEnum("stage", ["prospecting", "qualification", "proposal", "negotiation", "won", "lost"])
      .default("prospecting")
      .notNull(),
    expectedCloseDate: date("expectedCloseDate"),
    lossReason: varchar("lossReason", { length: 250 }),
    recordStatus: mysqlEnum("recordStatus", ["active", "inactive"]).default("active").notNull(),
    ownerId: int("ownerId").notNull(),
    createdById: int("createdById").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    inactivatedAt: timestamp("inactivatedAt"),
  },
  table => [
    index("opportunities_client_idx").on(table.clientId),
    index("opportunities_stage_idx").on(table.stage),
    index("opportunities_owner_idx").on(table.ownerId),
  ],
);

export const activities = mysqlTable(
  "activities",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["task", "appointment"]).default("task").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    clientId: int("clientId"),
    opportunityId: int("opportunityId"),
    assigneeId: int("assigneeId").notNull(),
    priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
    status: mysqlEnum("status", ["pending", "completed", "cancelled"]).default("pending").notNull(),
    dueAt: timestamp("dueAt"),
    completedAt: timestamp("completedAt"),
    recordStatus: mysqlEnum("recordStatus", ["active", "inactive"]).default("active").notNull(),
    createdById: int("createdById").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    inactivatedAt: timestamp("inactivatedAt"),
  },
  table => [
    index("activities_client_idx").on(table.clientId),
    index("activities_opportunity_idx").on(table.opportunityId),
    index("activities_assignee_idx").on(table.assigneeId),
    index("activities_status_idx").on(table.status),
  ],
);

export const interactions = mysqlTable(
  "interactions",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["call", "meeting", "email", "message", "note"]).notNull(),
    description: text("description").notNull(),
    clientId: int("clientId"),
    opportunityId: int("opportunityId"),
    authorId: int("authorId").notNull(),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    recordStatus: mysqlEnum("recordStatus", ["active", "inactive"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    inactivatedAt: timestamp("inactivatedAt"),
  },
  table => [
    index("interactions_client_idx").on(table.clientId),
    index("interactions_opportunity_idx").on(table.opportunityId),
  ],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: int("entityId").notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("audit_logs_entity_idx").on(table.entityType, table.entityId), index("audit_logs_user_idx").on(table.userId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
