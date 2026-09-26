import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const userId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";

const baseSession = {
  accessToken: "c4-3-3-access-token",
  expiresIn: 900,
  user: {
    id: userId,
    email: "seller@axes.test",
    displayName: "Vendedor Axes",
  },
  organization: {
    id: organizationId,
    name: "Axesistemas",
    slug: "axesistemas",
  },
  membership: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "SELLER",
  },
};

const product = {
  id: "44444444-4444-4444-8444-444444444444",
  protocol: "2026-000042",
  subject: "Chamado de navegação",
  name: "Chamado de navegação",
  description: null,
  status: "OPEN",
  priority: "MEDIUM",
  channel: "PHONE",
  companyId: null,
  contactId: null,
  assigneeUserId: null,
  openedAt: "2026-09-26T12:00:00.000Z",
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  version: 1,
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function authenticate(permissions: string[]) {
  const session = { ...baseSession, permissions };
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url.endsWith("/auth/refresh")) {
      return response({}, 401);
    }
    if (url.endsWith("/auth/login")) {
      return response(session);
    }
    if (url.includes("/companies?")) {
      return response({ items: [], page: 1, limit: 20, total: 0 });
    }
    if (url.includes("/tickets?")) {
      return response({ items: [product], page: 1, limit: 100, total: 1 });
    }

    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<Home />);

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: session.user.email },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "example-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar no CRM" }));

  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.3.3 tickets navigation", () => {
  it("opens the tickets catalog when the session has ticket.read", async () => {
    authenticate(["company.read", "ticket.read"]);

    await screen.findByText(baseSession.organization.name);

    fireEvent.click(await screen.findByRole("button", { name: "Atendimento" }));

    expect(
      await screen.findByRole("heading", { name: "Solicitações" })
    ).toBeInTheDocument();
    expect(await screen.findByText(product.name)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nova solicitação" })
    ).not.toBeInTheDocument();
  });

  it("hides the tickets section without ticket.read", async () => {
    const fetchMock = authenticate(["company.read"]);

    await screen.findByText(baseSession.organization.name);

    expect(
      screen.queryByRole("button", { name: "Atendimento" })
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/tickets"))
    ).toBe(false);
  });
});
