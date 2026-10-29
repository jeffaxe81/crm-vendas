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
  it("returns to the previous page after deleting its final record", async () => {
    let deleted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          deleted = true;
          return response(null, 204);
        }
        const page = new URL(String(input)).searchParams.get("page");
        return response({
          items:
            page === "2"
              ? deleted
                ? []
                : [territory]
              : [{ ...territory, id: "remaining", name: "Registro restante" }],
          total: deleted ? 50 : 51,
        });
      })
    );
    render(<TerritoriesView accessToken="token" canWrite />);
    await screen.findByText(/Registro restante/);
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir Território Norte" })
    );
    expect(await screen.findByText(/Registro restante/)).toBeVisible();
    expect(screen.queryByText(/Território Norte/)).not.toBeInTheDocument();
  });

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

  it("navigates through server-side territory pages", async () => {
    const secondPage = {
      ...territory,
      id: "t-51",
      name: "Território 51",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [territory], page: 1, limit: 50, total: 51 })
      )
      .mockResolvedValueOnce(
        response({ items: [secondPage], page: 2, limit: 50, total: 51 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<TerritoriesView accessToken="token" canWrite />);

    await screen.findByText(/Território Norte/);
    expect(screen.getByText(/Página 1 de 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    expect(await screen.findByText(/Território 51/)).toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 2/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/territories?page=1&limit=50"
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/territories?page=2&limit=50"
    );
  });

  it("reassigns a sales rep by display name", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [territory], total: 1 }))
      .mockResolvedValueOnce(
        response([
          {
            id: SALES_REP_ID,
            displayName: "Sales Rep",
            role: "SELLER",
          },
        ])
      )
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

    await screen.findByRole("option", { name: "Sales Rep" });
    fireEvent.change(within(form).getByLabelText("Vendedor"), {
      target: { value: SALES_REP_ID },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Confirmar atribuição" })
    );

    await waitFor(() => expect(screen.getByText("Sales Rep")).toBeVisible());
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/territories/sales-reps"
    );
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
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
      .mockResolvedValueOnce(response(null, 204))
      .mockResolvedValueOnce(response({ items: [], total: 0 }));
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
      if (url.endsWith("/territories?page=1&limit=50")) {
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

describe("territory CSV export", () => {
  it("downloads safe CSV for the current page without extra requests for readers", async () => {
    const blobs: Blob[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:territories";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [territory], total: 51 }))
      .mockResolvedValueOnce(
        response({
          items: [
            {
              ...territory,
              id: "hidden-id",
              name: "=SUM(1,2)",
              region: 'Sul, "Leste"\nÁrea',
              description: "hidden-description",
              salesRepId: "hidden-rep",
              version: 999,
            },
          ],
          total: 51,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<TerritoriesView accessToken="secret-token" canWrite={false} />);
    await screen.findByText(/Território Norte/);
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByRole("button", { name: /SUM\(1,2\)/ });
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar territórios CSV" })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe(
      "territorios.csv"
    );
    expect(blobs[0]!.type).toBe("text/csv;charset=utf-8");
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(blobs[0]!);
    });
    expect(csv).toContain('"Nome","Região","Vendedor"\r\n');
    expect(csv).toContain(
      '"\'=SUM(1,2)","Sul, ""Leste""\nÁrea","Vendedor indisponível"'
    );
    for (const hidden of [
      "Território Norte",
      "hidden-id",
      "hidden-description",
      "hidden-rep",
      "999",
      "secret-token",
    ])
      expect(csv).not.toContain(hidden);
    expect(
      screen.queryByRole("button", { name: "Novo território" })
    ).not.toBeInTheDocument();
    click.mockRestore();
  });

  it("disables export while loading, empty, or after a failed search with stale rows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [territory], total: 1 }))
      .mockRejectedValueOnce(new Error("Search failed"))
      .mockResolvedValueOnce(response({ items: [], total: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TerritoriesView accessToken="token" canWrite={false} />);
    const button = screen.getByRole("button", {
      name: "Exportar territórios CSV",
    });
    expect(button).toBeDisabled();
    await screen.findByText(/Território Norte/);
    expect(button).toBeEnabled();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "failed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await screen.findByRole("alert");
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "empty" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await screen.findByText("Nenhum território encontrado.");
    expect(button).toBeDisabled();
  });
});

it("does not export stale search results when opening a form clears the error", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response({ items: [territory], total: 1 }))
    .mockRejectedValueOnce(new Error("Search failed"));
  vi.stubGlobal("fetch", fetchMock);
  render(<TerritoriesView accessToken="token" canWrite />);
  await screen.findByText(/Território Norte/);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "new query" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Novo território" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Exportar territórios CSV" })
  ).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
