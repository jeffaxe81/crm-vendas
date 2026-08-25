import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getActiveLocalUserById: vi.fn() }));

import * as db from "./db";
import { COOKIE_NAME } from "../shared/const";
import { createLocalSession, getLocalSessionUser } from "./localAuth";

describe("localAuth", () => {
  it("assina uma sessão local e recupera exclusivamente o usuário ativo correspondente", async () => {
    const user = { id: 22, openId: "local:vendas", username: "vendas", passwordHash: "hash", name: "Vendas", email: null, loginMethod: "local", role: "user" as const, isActive: "yes" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    vi.mocked(db.getActiveLocalUserById).mockResolvedValue(user);
    const token = await createLocalSession(22);

    const result = await getLocalSessionUser({ headers: { cookie: `${COOKIE_NAME}=${token}` } } as never);

    expect(db.getActiveLocalUserById).toHaveBeenCalledWith(22);
    expect(result).toEqual(user);
  });

  it("rejeita um cookie que não seja uma sessão local válida", async () => {
    const result = await getLocalSessionUser({ headers: { cookie: `${COOKIE_NAME}=token-invalido` } } as never);

    expect(result).toBeNull();
  });
});
