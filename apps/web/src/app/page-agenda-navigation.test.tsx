import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const baseSession = {
  accessToken: "test-access-token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "seller@example.test",
    displayName: "Vendedor",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Axesistemas",
    slug: "axesistemas",
  },
  membership: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "SELLER",
  },
};

const sessionWithAgenda = {
  ...baseSession,
  permissions: ["company.read", "contact.read", "activity.read"],
};

const sessionWithoutAgenda = {
  ...baseSession,
  permissions: ["company.read", "contact.read"],
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const emptyCompanies = { items: [], page: 1, limit: 20, total: 0 };
const emptyActivities = { items: [], page: 1, limit: 100, total: 0 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWithSession(session: typeof sessionWithAgenda) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      return response(session);
    }
    if (url.includes("/companies?")) {
      return response(emptyCompanies);
    }
    if (url.includes("/activities?")) {
      return response(emptyActivities);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Home />);
}

describe("C4.1 agenda navigation", () => {
  it("opens agenda when the session has activity.read", async () => {
    renderWithSession(sessionWithAgenda);

    fireEvent.click(await screen.findByRole("button", { name: "Agenda" }));

    expect(
      await screen.findByRole("heading", { name: "Agenda Comercial" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Anterior" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoje" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Próximo" })
    ).toBeInTheDocument();
  });

  it("hides agenda when the session lacks activity.read", async () => {
    renderWithSession(sessionWithoutAgenda);

    await screen.findByText(sessionWithoutAgenda.organization.name);
    expect(
      screen.queryByRole("button", { name: "Agenda" })
    ).not.toBeInTheDocument();
  });
});
