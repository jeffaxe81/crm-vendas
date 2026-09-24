import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const baseSession = {
  accessToken: "test-access-token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.test",
    displayName: "Administrador",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Axesistemas",
    slug: "axesistemas",
  },
  membership: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "ADMIN",
  },
};

const sessionWithReports = {
  ...baseSession,
  permissions: [
    "company.read",
    "contact.read",
    "activity.read",
    "opportunity.read",
    "reports.read",
  ],
};

const sessionWithoutReports = {
  ...baseSession,
  permissions: [
    "company.read",
    "contact.read",
    "activity.read",
    "opportunity.read",
  ],
};

const managementSummary = {
  asOf: "2026-09-13T12:00:00.000Z",
  opportunitiesByStage: [
    {
      pipelineId: "44444444-4444-4444-8444-444444444444",
      pipelineName: "Comercial",
      stageId: "55555555-5555-4555-8555-555555555555",
      stageName: "Proposta",
      count: 3,
    },
  ],
  openEstimatedValue: "12500.50",
  pendingActivities: 7,
  overdueActivities: 2,
  undatedActivities: 1,
};

const salesByProduct = {
  asOf: "2026-09-23T12:00:00.000Z",
  filters: { from: null, to: null, pipelineId: null, ownerUserId: null },
  items: [
    {
      productId: "66666666-6666-4666-8666-666666666666",
      productCode: "LIC",
      productName: "Licença PABX",
      productActive: true,
      productDeleted: false,
      open: { quantity: "0.000", opportunities: 0, value: "0.00" },
      won: { quantity: "2.000", opportunities: 1, value: "2400.00" },
      lost: { quantity: "0.000", opportunities: 0, value: "0.00" },
      total: { quantity: "2.000", opportunities: 1, value: "2400.00" },
    },
  ],
  totals: {
    open: { quantity: "0.000", opportunities: 0, value: "0.00" },
    won: { quantity: "2.000", opportunities: 1, value: "2400.00" },
    lost: { quantity: "0.000", opportunities: 0, value: "0.00" },
    total: { quantity: "2.000", opportunities: 1, value: "2400.00" },
  },
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const emptyCompanies = { items: [], page: 1, limit: 20, total: 0 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWithSession(session: typeof sessionWithReports) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      return response(session);
    }
    if (url.includes("/companies?")) {
      return response(emptyCompanies);
    }
    if (url.endsWith("/reports/management-summary")) {
      return response(managementSummary);
    }
    if (url.endsWith("/reports/sales-by-product")) {
      return response(salesByProduct);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Home />);
}

describe("C4.1.1 management summary navigation", () => {
  it("opens the management summary for a session with reports.read", async () => {
    renderWithSession(sessionWithReports);

    fireEvent.click(
      await screen.findByRole("button", { name: "Resumo gerencial" })
    );

    expect(
      await screen.findByRole("heading", { name: "Resumo gerencial" })
    ).toBeInTheDocument();
    expect(screen.getByText("R$ 12.500,50")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Proposta")).toBeInTheDocument();
  });

  it("opens the sales by product tab inside the reports section", async () => {
    renderWithSession(sessionWithReports);

    fireEvent.click(
      await screen.findByRole("button", { name: "Resumo gerencial" })
    );
    await screen.findByText("R$ 12.500,50");

    const tab = screen.getByRole("tab", { name: "Vendas por produto" });
    expect(tab).toHaveAttribute("aria-selected", "false");
    fireEvent.click(tab);

    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByRole("heading", { name: "Vendas por produto" })
    ).toBeInTheDocument();
    expect(await screen.findByText("LIC — Licença PABX")).toBeInTheDocument();
    expect(screen.queryByText("R$ 12.500,50")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Indicadores" }));
    expect(screen.getByText("R$ 12.500,50")).toBeInTheDocument();
  });

  it("hides the management summary without reports.read", async () => {
    renderWithSession(sessionWithoutReports);

    await screen.findByText(sessionWithoutReports.organization.name);
    expect(
      screen.queryByRole("button", { name: "Resumo gerencial" })
    ).not.toBeInTheDocument();
  });
});
