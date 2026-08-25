import { and, asc, count, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  activities,
  auditLogs,
  clients,
  contacts,
  interactions,
  opportunities,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

type ClientKind = "person" | "company";
type ClientStatus = "active" | "inactive" | "all";
type OpportunityStage = "prospecting" | "qualification" | "proposal" | "negotiation" | "won" | "lost";
type ActivityStatus = "pending" | "completed" | "cancelled";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

function textOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function insertId(result: unknown) {
  const payload = Array.isArray(result) ? result[0] : result;
  const id = Number((payload as { insertId?: number }).insertId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Could not determine the created record identifier");
  return id;
}

function buildWhere(filters: SQL[]) {
  return filters.length > 0 ? and(...filters) : undefined;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function writeAudit(userId: number, action: string, entityType: string, entityId: number, summary: string) {
  const db = await requireDb();
  await db.insert(auditLogs).values({ userId, action, entityType, entityId, summary });
}

export async function listClients(input: { page?: number; pageSize?: number; search?: string; status?: ClientStatus; type?: ClientKind }) {
  const db = await requireDb();
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
  const filters: SQL[] = [];
  const resolvedStatus = input.status ?? "active";
  if (resolvedStatus !== "all") filters.push(eq(clients.status, resolvedStatus));
  if (input.type) filters.push(eq(clients.type, input.type));
  if (input.search?.trim()) {
    const term = `%${input.search.trim()}%`;
    filters.push(or(like(clients.name, term), like(clients.document, term), like(clients.email, term), like(clients.phone, term))!);
  }
  const where = buildWhere(filters);
  const [items, totalRows] = await Promise.all([
    db.select().from(clients).where(where).orderBy(desc(clients.updatedAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(clients).where(where),
  ]);
  return { items, total: Number(totalRows[0]?.total ?? 0), page, pageSize };
}

export async function listActiveClientOptions() {
  const db = await requireDb();
  return db
    .select({ id: clients.id, name: clients.name, type: clients.type })
    .from(clients)
    .where(eq(clients.status, "active"))
    .orderBy(asc(clients.name));
}

export async function getActiveClient(id: number) {
  const db = await requireDb();
  const result = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.status, "active"))).limit(1);
  return result[0];
}

export async function createClient(input: { type: ClientKind; name: string; document?: string | null; email?: string | null; phone?: string | null; city?: string | null }, userId: number) {
  const db = await requireDb();
  const result = await db.insert(clients).values({
    type: input.type,
    name: input.name.trim(),
    document: textOrNull(input.document),
    email: textOrNull(input.email),
    phone: textOrNull(input.phone),
    city: textOrNull(input.city),
    createdById: userId,
  });
  const id = insertId(result);
  await writeAudit(userId, "create", "client", id, `Cliente criado: ${input.name.trim()}`);
  return id;
}

export async function updateClient(input: { id: number; type: ClientKind; name: string; document?: string | null; email?: string | null; phone?: string | null; city?: string | null }, userId: number) {
  const db = await requireDb();
  await db
    .update(clients)
    .set({ type: input.type, name: input.name.trim(), document: textOrNull(input.document), email: textOrNull(input.email), phone: textOrNull(input.phone), city: textOrNull(input.city) })
    .where(and(eq(clients.id, input.id), eq(clients.status, "active")));
  await writeAudit(userId, "update", "client", input.id, `Cliente atualizado: ${input.name.trim()}`);
}

export async function inactivateClient(id: number, userId: number) {
  const db = await requireDb();
  const client = await getActiveClient(id);
  if (!client) throw new Error("Client not found or already inactive");
  await db.update(clients).set({ status: "inactive", inactivatedAt: new Date() }).where(eq(clients.id, id));
  await writeAudit(userId, "inactivate", "client", id, `Cliente inativado: ${client.name}`);
}

export async function listContacts(input: { clientId: number; page?: number; pageSize?: number; search?: string; filter?: "all" | "primary" }) {
  const db = await requireDb();
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 10, 1), 50);
  const filters: SQL[] = [eq(contacts.clientId, input.clientId), eq(contacts.status, "active")];
  if (input.search?.trim()) {
    const term = `%${input.search.trim()}%`;
    filters.push(or(like(contacts.name, term), like(contacts.jobTitle, term), like(contacts.email, term), like(contacts.phone, term))!);
  }
  if (input.filter === "primary") filters.push(eq(contacts.isPrimary, "yes"));
  const where = and(...filters);
  const [items, totalRows] = await Promise.all([
    db.select().from(contacts).where(where).orderBy(desc(contacts.isPrimary), asc(contacts.name)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(contacts).where(where),
  ]);
  return { items, total: Number(totalRows[0]?.total ?? 0), page, pageSize };
}

export async function createContact(input: { clientId: number; name: string; jobTitle?: string | null; email?: string | null; phone?: string | null; isPrimary?: boolean }, userId: number) {
  const db = await requireDb();
  const client = await getActiveClient(input.clientId);
  if (!client || client.type !== "company") throw new Error("A contact must be linked to an active company");
  if (input.isPrimary) await db.update(contacts).set({ isPrimary: "no" }).where(eq(contacts.clientId, input.clientId));
  const result = await db.insert(contacts).values({
    clientId: input.clientId,
    name: input.name.trim(),
    jobTitle: textOrNull(input.jobTitle),
    email: textOrNull(input.email),
    phone: textOrNull(input.phone),
    isPrimary: input.isPrimary ? "yes" : "no",
    createdById: userId,
  });
  const id = insertId(result);
  await writeAudit(userId, "create", "contact", id, `Contato criado: ${input.name.trim()}`);
  return id;
}

export async function updateContact(input: { id: number; clientId: number; name: string; jobTitle?: string | null; email?: string | null; phone?: string | null; isPrimary?: boolean }, userId: number) {
  const db = await requireDb();
  const client = await getActiveClient(input.clientId);
  if (!client || client.type !== "company") throw new Error("A contact must be linked to an active company");
  const existing = await db.select().from(contacts).where(and(eq(contacts.id, input.id), eq(contacts.clientId, input.clientId), eq(contacts.status, "active"))).limit(1);
  if (!existing[0]) throw new Error("Contact not found or inactive");
  if (input.isPrimary) await db.update(contacts).set({ isPrimary: "no" }).where(and(eq(contacts.clientId, input.clientId), eq(contacts.id, input.id)));
  await db.update(contacts).set({
    name: input.name.trim(),
    jobTitle: textOrNull(input.jobTitle),
    email: textOrNull(input.email),
    phone: textOrNull(input.phone),
    isPrimary: input.isPrimary ? "yes" : "no",
  }).where(eq(contacts.id, input.id));
  await writeAudit(userId, "update", "contact", input.id, `Contato atualizado: ${input.name.trim()}`);
}

export async function inactivateContact(id: number, userId: number) {
  const db = await requireDb();
  const contact = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.status, "active"))).limit(1);
  if (!contact[0]) throw new Error("Contact not found or already inactive");
  await db.update(contacts).set({ status: "inactive", inactivatedAt: new Date() }).where(eq(contacts.id, id));
  await writeAudit(userId, "inactivate", "contact", id, `Contato inativado: ${contact[0].name}`);
}

export async function listOpportunities(input: { page?: number; pageSize?: number; stage?: OpportunityStage; search?: string }) {
  const db = await requireDb();
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 50, 1), 100);
  const filters: SQL[] = [eq(opportunities.recordStatus, "active")];
  if (input.stage) filters.push(eq(opportunities.stage, input.stage));
  if (input.search?.trim()) {
    const term = `%${input.search.trim()}%`;
    filters.push(or(like(opportunities.title, term), like(clients.name, term))!);
  }
  const where = buildWhere(filters);
  const selection = {
    id: opportunities.id,
    title: opportunities.title,
    estimatedValue: opportunities.estimatedValue,
    stage: opportunities.stage,
    expectedCloseDate: opportunities.expectedCloseDate,
    updatedAt: opportunities.updatedAt,
    clientId: clients.id,
    clientName: clients.name,
  };
  const [items, totalRows] = await Promise.all([
    db.select(selection).from(opportunities).innerJoin(clients, eq(opportunities.clientId, clients.id)).where(where).orderBy(desc(opportunities.updatedAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(opportunities).innerJoin(clients, eq(opportunities.clientId, clients.id)).where(where),
  ]);
  return { items, total: Number(totalRows[0]?.total ?? 0), page, pageSize };
}

export async function createOpportunity(input: { clientId: number; title: string; estimatedValue: number; expectedCloseDate?: string | null; stage?: OpportunityStage }, userId: number) {
  const db = await requireDb();
  const client = await getActiveClient(input.clientId);
  if (!client) throw new Error("Opportunity requires an active client");
  const result = await db.insert(opportunities).values({
    clientId: input.clientId,
    title: input.title.trim(),
    estimatedValue: input.estimatedValue.toFixed(2),
    expectedCloseDate: input.expectedCloseDate ? new Date(`${input.expectedCloseDate}T00:00:00.000Z`) : null,
    stage: input.stage ?? "prospecting",
    ownerId: userId,
    createdById: userId,
  });
  const id = insertId(result);
  await writeAudit(userId, "create", "opportunity", id, `Oportunidade criada: ${input.title.trim()}`);
  return id;
}

export async function updateOpportunity(input: { id: number; clientId: number; title: string; estimatedValue: number; expectedCloseDate?: string | null; stage: OpportunityStage }, userId: number) {
  const db = await requireDb();
  const client = await getActiveClient(input.clientId);
  if (!client) throw new Error("Opportunity requires an active client");
  const existing = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, input.id), eq(opportunities.recordStatus, "active"))).limit(1);
  if (!existing[0]) throw new Error("Opportunity not found or inactive");
  await db.update(opportunities).set({
    clientId: input.clientId,
    title: input.title.trim(),
    estimatedValue: input.estimatedValue.toFixed(2),
    expectedCloseDate: input.expectedCloseDate ? new Date(`${input.expectedCloseDate}T00:00:00.000Z`) : null,
    stage: input.stage,
  }).where(eq(opportunities.id, input.id));
  await writeAudit(userId, "update", "opportunity", input.id, `Oportunidade atualizada: ${input.title.trim()}`);
}

export async function inactivateOpportunity(id: number, userId: number) {
  const db = await requireDb();
  const current = await db.select({ title: opportunities.title }).from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.recordStatus, "active"))).limit(1);
  if (!current[0]) throw new Error("Opportunity not found or already inactive");
  await db.update(opportunities).set({ recordStatus: "inactive", inactivatedAt: new Date() }).where(eq(opportunities.id, id));
  await writeAudit(userId, "inactivate", "opportunity", id, `Oportunidade inativada: ${current[0].title}`);
}

export async function moveOpportunity(input: { id: number; stage: OpportunityStage; lossReason?: string | null }, userId: number) {
  const db = await requireDb();
  const current = await db.select({ id: opportunities.id, title: opportunities.title }).from(opportunities).where(and(eq(opportunities.id, input.id), eq(opportunities.recordStatus, "active"))).limit(1);
  if (!current[0]) throw new Error("Opportunity not found");
  await db.update(opportunities).set({ stage: input.stage, lossReason: input.stage === "lost" ? textOrNull(input.lossReason) : null }).where(and(eq(opportunities.id, input.id), eq(opportunities.recordStatus, "active")));
  await writeAudit(userId, "move_stage", "opportunity", input.id, `Oportunidade movida para ${input.stage}: ${current[0].title}`);
}

export async function listActivities(input: { status?: ActivityStatus; clientId?: number; opportunityId?: number; userId?: number }) {
  const db = await requireDb();
  const filters: SQL[] = [eq(activities.recordStatus, "active")];
  if (input.status) filters.push(eq(activities.status, input.status));
  if (input.clientId) filters.push(eq(activities.clientId, input.clientId));
  if (input.opportunityId) filters.push(eq(activities.opportunityId, input.opportunityId));
  if (input.userId) filters.push(eq(activities.assigneeId, input.userId));
  return db
    .select({ id: activities.id, type: activities.type, title: activities.title, description: activities.description, priority: activities.priority, status: activities.status, dueAt: activities.dueAt, clientId: activities.clientId, opportunityId: activities.opportunityId, clientName: clients.name, opportunityTitle: opportunities.title })
    .from(activities)
    .leftJoin(clients, eq(activities.clientId, clients.id))
    .leftJoin(opportunities, eq(activities.opportunityId, opportunities.id))
    .where(buildWhere(filters))
    .orderBy(asc(activities.dueAt), desc(activities.createdAt));
}

export async function createActivity(input: { type: "task" | "appointment"; title: string; description?: string | null; clientId?: number | null; opportunityId?: number | null; priority?: "low" | "medium" | "high"; dueAt?: Date | null }, userId: number) {
  const db = await requireDb();
  if (input.clientId && !(await getActiveClient(input.clientId))) throw new Error("Activity client must be active");
  const result = await db.insert(activities).values({
    type: input.type,
    title: input.title.trim(),
    description: textOrNull(input.description),
    clientId: input.clientId || null,
    opportunityId: input.opportunityId || null,
    priority: input.priority ?? "medium",
    dueAt: input.dueAt || null,
    assigneeId: userId,
    createdById: userId,
  });
  const id = insertId(result);
  await writeAudit(userId, "create", "activity", id, `Atividade criada: ${input.title.trim()}`);
  return id;
}

export async function updateActivityStatus(id: number, status: ActivityStatus, userId: number) {
  const db = await requireDb();
  const activity = await db.select({ title: activities.title }).from(activities).where(eq(activities.id, id)).limit(1);
  if (!activity[0]) throw new Error("Activity not found");
  await db.update(activities).set({ status, completedAt: status === "completed" ? new Date() : null }).where(eq(activities.id, id));
  await writeAudit(userId, status === "completed" ? "complete" : "update_status", "activity", id, `Atividade ${status}: ${activity[0].title}`);
}

export async function inactivateActivity(id: number, userId: number) {
  const db = await requireDb();
  const activity = await db.select({ title: activities.title }).from(activities).where(and(eq(activities.id, id), eq(activities.recordStatus, "active"))).limit(1);
  if (!activity[0]) throw new Error("Activity not found or already inactive");
  await db.update(activities).set({ recordStatus: "inactive", inactivatedAt: new Date() }).where(eq(activities.id, id));
  await writeAudit(userId, "inactivate", "activity", id, `Atividade inativada: ${activity[0].title}`);
}

export async function listInteractions(input: { clientId?: number; opportunityId?: number }) {
  const db = await requireDb();
  const filters: SQL[] = [eq(interactions.recordStatus, "active")];
  if (input.clientId) filters.push(eq(interactions.clientId, input.clientId));
  if (input.opportunityId) filters.push(eq(interactions.opportunityId, input.opportunityId));
  return db
    .select({ id: interactions.id, type: interactions.type, description: interactions.description, occurredAt: interactions.occurredAt, clientId: interactions.clientId, opportunityId: interactions.opportunityId, authorName: users.name, clientName: clients.name, opportunityTitle: opportunities.title })
    .from(interactions)
    .leftJoin(users, eq(interactions.authorId, users.id))
    .leftJoin(clients, eq(interactions.clientId, clients.id))
    .leftJoin(opportunities, eq(interactions.opportunityId, opportunities.id))
    .where(buildWhere(filters))
    .orderBy(desc(interactions.occurredAt));
}

export async function createInteraction(input: { type: "call" | "meeting" | "email" | "message" | "note"; description: string; clientId?: number | null; opportunityId?: number | null; occurredAt?: Date }, userId: number) {
  const db = await requireDb();
  if (!input.clientId && !input.opportunityId) throw new Error("Interaction must be linked to a client or opportunity");
  const result = await db.insert(interactions).values({
    type: input.type,
    description: input.description.trim(),
    clientId: input.clientId || null,
    opportunityId: input.opportunityId || null,
    authorId: userId,
    occurredAt: input.occurredAt ?? new Date(),
  });
  const id = insertId(result);
  await writeAudit(userId, "create", "interaction", id, `Interação registrada: ${input.type}`);
  return id;
}

export async function inactivateInteraction(id: number, userId: number) {
  const db = await requireDb();
  const interaction = await db.select({ type: interactions.type }).from(interactions).where(and(eq(interactions.id, id), eq(interactions.recordStatus, "active"))).limit(1);
  if (!interaction[0]) throw new Error("Interaction not found or already inactive");
  await db.update(interactions).set({ recordStatus: "inactive", inactivatedAt: new Date() }).where(eq(interactions.id, id));
  await writeAudit(userId, "inactivate", "interaction", id, `Interação inativada: ${interaction[0].type}`);
}

export async function getDashboard(userId: number) {
  const db = await requireDb();
  const openStages: OpportunityStage[] = ["prospecting", "qualification", "proposal", "negotiation"];
  const [activeClientRows, openOpportunityRows, pendingActivityRows, pipeline, myActivities, recentOpportunities] = await Promise.all([
    db.select({ total: count() }).from(clients).where(eq(clients.status, "active")),
    db.select({ total: count(), value: sql<string>`coalesce(sum(${opportunities.estimatedValue}), 0)` }).from(opportunities).where(and(eq(opportunities.recordStatus, "active"), inArray(opportunities.stage, openStages))),
    db.select({ total: count() }).from(activities).where(and(eq(activities.assigneeId, userId), eq(activities.status, "pending"), eq(activities.recordStatus, "active"))),
    db.select({ stage: opportunities.stage, quantity: count(), value: sql<string>`coalesce(sum(${opportunities.estimatedValue}), 0)` }).from(opportunities).where(eq(opportunities.recordStatus, "active")).groupBy(opportunities.stage),
    listActivities({ status: "pending", userId }),
    db.select({ id: opportunities.id, title: opportunities.title, estimatedValue: opportunities.estimatedValue, stage: opportunities.stage, clientName: clients.name, updatedAt: opportunities.updatedAt }).from(opportunities).innerJoin(clients, eq(opportunities.clientId, clients.id)).where(eq(opportunities.recordStatus, "active")).orderBy(desc(opportunities.updatedAt)).limit(6),
  ]);
  return {
    metrics: {
      activeClients: Number(activeClientRows[0]?.total ?? 0),
      openOpportunities: Number(openOpportunityRows[0]?.total ?? 0),
      openPipelineValue: String(openOpportunityRows[0]?.value ?? "0"),
      pendingActivities: Number(pendingActivityRows[0]?.total ?? 0),
    },
    pipeline: pipeline.map(item => ({ ...item, quantity: Number(item.quantity), value: String(item.value ?? "0") })),
    myActivities: myActivities.slice(0, 6),
    recentOpportunities,
  };
}

export async function listAuditLogs() {
  const db = await requireDb();
  return db
    .select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, summary: auditLogs.summary, createdAt: auditLogs.createdAt, userName: users.name, userEmail: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);
}
