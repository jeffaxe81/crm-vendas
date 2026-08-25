import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDashboard: vi.fn(),
  listClients: vi.fn(),
  listActiveClientOptions: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  inactivateClient: vi.fn(),
  listContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  inactivateContact: vi.fn(),
  listOpportunities: vi.fn(),
  createOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  inactivateOpportunity: vi.fn(),
  moveOpportunity: vi.fn(),
  listActivities: vi.fn(),
  createActivity: vi.fn(),
  updateActivityStatus: vi.fn(),
  inactivateActivity: vi.fn(),
  listInteractions: vi.fn(),
  createInteraction: vi.fn(),
  inactivateInteraction: vi.fn(),
  listAuditLogs: vi.fn(),
}));

import * as db from "./db";
import { appRouter } from "./routers";

function createContext(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 41,
      openId: "crm-test-user",
      name: "Usuário de Teste",
      email: "teste@example.com",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("CRM procedures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("valida o nome do cliente antes de encaminhar o cadastro", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(caller.clients.create({ type: "company", name: "A" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.createClient).not.toHaveBeenCalled();
  });

  it("cria um cliente com o usuário autenticado como responsável", async () => {
    vi.mocked(db.createClient).mockResolvedValue(300);
    const caller = appRouter.createCaller(createContext());

    const result = await caller.clients.create({ type: "company", name: "Orion Sistemas", email: "contato@orion.test" });

    expect(result).toBe(300);
    expect(db.createClient).toHaveBeenCalledWith({ type: "company", name: "Orion Sistemas", email: "contato@orion.test" }, 41);
  });

  it("move uma oportunidade por uma etapa válida do funil", async () => {
    const caller = appRouter.createCaller(createContext());

    await caller.opportunities.move({ id: 12, stage: "negotiation" });

    expect(db.moveOpportunity).toHaveBeenCalledWith({ id: 12, stage: "negotiation" }, 41);
  });

  it("atualiza os dados completos de uma oportunidade", async () => {
    const caller = appRouter.createCaller(createContext());
    const input = { id: 12, clientId: 8, title: "Expansão anual", estimatedValue: 98000, expectedCloseDate: "2026-09-30", stage: "proposal" as const };

    await caller.opportunities.update(input);

    expect(db.updateOpportunity).toHaveBeenCalledWith(input, 41);
  });

  it("inativa uma oportunidade preservando a responsabilidade do usuário", async () => {
    const caller = appRouter.createCaller(createContext());

    await caller.opportunities.inactivate({ id: 12 });

    expect(db.inactivateOpportunity).toHaveBeenCalledWith(12, 41);
  });

  it("inativa atividades e interações mantendo o responsável autenticado", async () => {
    const caller = appRouter.createCaller(createContext());

    await caller.activities.inactivate({ id: 77 });
    await caller.interactions.inactivate({ id: 91 });

    expect(db.inactivateActivity).toHaveBeenCalledWith(77, 41);
    expect(db.inactivateInteraction).toHaveBeenCalledWith(91, 41);
  });

  it("registra a conclusão de uma atividade para o usuário autenticado", async () => {
    const caller = appRouter.createCaller(createContext());

    await caller.activities.updateStatus({ id: 77, status: "completed" });

    expect(db.updateActivityStatus).toHaveBeenCalledWith(77, "completed", 41);
  });

  it("restringe a consulta de auditoria para administradores", async () => {
    const regularCaller = appRouter.createCaller(createContext("user"));
    const adminCaller = appRouter.createCaller(createContext("admin"));
    vi.mocked(db.listAuditLogs).mockResolvedValue([]);

    await expect(regularCaller.audit.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminCaller.audit.list()).resolves.toEqual([]);
  });
});
