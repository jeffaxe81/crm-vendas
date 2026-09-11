import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const userId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";

const sessionWithOpportunities = {
  accessToken: "c3-6-4-access-token",
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
  permissions: [
    "company.read",
    "contact.read",
    "activity.read",
    "opportunity.read",
  ],
};

const opportunity = {
  id: "44444444-4444-4444-8444-444444444444",
  organizationId,
  pipelineId: "55555555-5555-4555-8555-555555555555",
  stageId: "66666666-6666-4666-8666-666666666666",
  companyId: "77777777-7777-4777-8777-777777777777",
  contactId: null,
  ownerUserId: userId,
  title: "Renovação contrato anual",
  estimatedValue: "12500.00",
  expectedCloseAt: "2026-09-30T18:00:00.000Z",
  notes: null,
  version: 1,
  createdBy: userId,
  updatedBy: userId,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-09-10T18:00:00.000Z",
  updatedAt: "2026-09-10T18:00:00.000Z",
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const emptyCompanies = { items: [], page: 1, limit: 20, total: 0 };

function authenticate() {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url.endsWith("/auth/refresh")) {
      return response({}, 401);
    }
    if (url.endsWith("/auth/login")) {
      return response(sessionWithOpportunities);
    }
    if (url.includes("/companies?")) {
      return response(emptyCompanies);
    }
    if (url.includes("/opportunities?")) {
      return response({ items: [opportunity], page: 1, limit: 20, total: 1 });
    }

    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<Home />);

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: sessionWithOpportunities.user.email },
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

describe("C3.6.4 opportunities navigation and list", () => {
  it("opens the opportunities list when the session has opportunity.read", async () => {
    authenticate();

    await screen.findByText(sessionWithOpportunities.organization.name);

    const opportunitiesNavigation = await screen.findByRole("button", {
      name: "Oportunidades",
    });
    fireEvent.click(opportunitiesNavigation);

    expect(
      await screen.findByRole("heading", { name: "Oportunidades" })
    ).toBeInTheDocument();
    expect(
      await screen.findByText(opportunity.title, { exact: true })
    ).toBeInTheDocument();
  });
});
