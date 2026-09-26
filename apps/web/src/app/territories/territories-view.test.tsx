import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TerritoriesView } from "./territories-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const territory = {
  id: "t-1",
  name: "Território Norte",
  region: "Norte",
  description: null,
  salesRepId: null,
  version: 1,
};

const SALES_REP_ID = "66666666-6666-4666-8666-666666666666";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.1.6 territories view", () => {
  it("lists territories and creates a new one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [territory], total: 1 }))
      .mockResolvedValueOnce(response({ ...territory, id: "t-2" }, 201))
      .mockResolvedValueOnce(
        response({
          items: [
            territory,
            { ...territory, id: "t-2", name: "Território Sul", region: "Sul" },
          ],
          total: 2,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<TerritoriesView accessToken="token" canWrite />);

    expect(await screen.findByText(/Território Norte/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Novo território" }));
    const form = screen.getByRole("form", { name: "Novo território" });
    fireEvent.change(within(form).getByLabelText("Nome"), {
      target: { value: "Território Sul" },
    });
    fireEvent.change(within(form).getByLabelText("Região"), {
      target: { value: "Sul" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Salvar território" })
    );

    expect(await screen.findByText(/Território Sul/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/territories");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "Território Sul",
      region: "Sul",
    });
  });

  it("reassigns a sales rep", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [territory], total: 1 }))
      .mockResolvedValueOnce(
        response({ ...territory, salesRepId: SALES_REP_ID })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<TerritoriesView accessToken="token" canWrite />);
    await screen.findByText(/Território Norte/);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Atribuir vendedor a Território Norte",
      })
    );
    const form = screen.getByRole("form", {
      name: "Atribuir vendedor a Território Norte",
    });
    fireEvent.change(within(form).getByLabelText("ID do vendedor (UUID)"), {
      target: { value: SALES_REP_ID },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Confirmar atribuição" })
    );

    await waitFor(() => expect(screen.getByText(SALES_REP_ID)).toBeVisible());
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/territories/t-1/reassign");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      salesRepId: SALES_REP_ID,
    });
  });

  it("deletes a territory", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [territory], total: 1 }))
      .mockResolvedValueOnce(response(null, 204));
    vi.stubGlobal("fetch", fetchMock);

    render(<TerritoriesView accessToken="token" canWrite />);
    await screen.findByText(/Território Norte/);

    fireEvent.click(
      screen.getByRole("button", { name: "Excluir Território Norte" })
    );

    await waitFor(() =>
      expect(screen.queryByText(/Território Norte/)).not.toBeInTheDocument()
    );
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/territories/t-1");
    expect(init.method).toBe("DELETE");
  });

  it("expands a territory to show coverage, quotas and metrics", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/territories?page=1&limit=100")) {
        return response({ items: [territory], total: 1 });
      }
      if (url.includes("/metrics")) {
        return response({
          coveragePercentage: "50.00",
          quotaPercentage: "20.00",
          actualRevenue: "1000.00",
          targetCount: 2,
          coveredCount: 1,
        });
      }
      if (url.includes("/coverage")) {
        return response([
          {
            id: "target-1",
            companyId: "company-1",
            coverageStatus: "COVERED",
            company: { id: "company-1", legalName: "Empresa Alvo" },
          },
        ]);
      }
      if (url.includes("/quotas")) {
        return response([
          {
            id: "q-1",
            period: "MONTH",
            year: 2026,
            amount: "5000.00",
            actual: "1000.00",
          },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TerritoriesView accessToken="token" canWrite />);
    fireEvent.click(await screen.findByText(/Território Norte/));

    expect(await screen.findByText("Empresa Alvo")).toBeVisible();
    expect(screen.getByText("50.00%")).toBeVisible();
    expect(screen.getAllByText(/R\$\s*1\.000,00/).length).toBeGreaterThan(0);
  });
});
