import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { periodBoundary, SalesByProductView } from "./sales-by-product-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const bucket = (quantity: string, opportunities: number, value: string) => ({
  quantity,
  opportunities,
  value,
});
const empty = bucket("0.000", 0, "0.00");

const report = {
  asOf: "2026-09-23T12:00:00.000Z",
  filters: { from: null, to: null, pipelineId: null, ownerUserId: null },
  items: [
    {
      productId: "11111111-1111-4111-8111-111111111111",
      productCode: "LIC",
      productName: "Licença PABX",
      productActive: true,
      productDeleted: false,
      open: bucket("4.000", 1, "2800.00"),
      won: bucket("3.500", 2, "3500.00"),
      lost: empty,
      total: bucket("7.500", 3, "6300.00"),
    },
    {
      productId: "22222222-2222-4222-8222-222222222222",
      productCode: "SUP",
      productName: "Suporte",
      productActive: false,
      productDeleted: true,
      open: bucket("1.000", 1, "300.00"),
      won: empty,
      lost: empty,
      total: bucket("1.000", 1, "300.00"),
    },
  ],
  totals: {
    open: bucket("5.000", 2, "3100.00"),
    won: bucket("3.500", 2, "3500.00"),
    lost: empty,
    total: bucket("8.500", 4, "6600.00"),
  },
};

const PIPELINE_ID = "44444444-4444-4444-8444-444444444444";
const OWNER_ID = "55555555-5555-4555-8555-555555555555";

const ownersReport = {
  asOf: "2026-09-25T12:00:00.000Z",
  filters: { from: null, to: null, pipelineId: null },
  items: [
    {
      ownerUserId: OWNER_ID,
      ownerName: "Bruno Vendas",
      ownerActive: false,
      open: { opportunities: 0, value: "0.00" },
      won: { opportunities: 1, value: "10.00" },
      lost: { opportunities: 0, value: "0.00" },
      total: { opportunities: 1, value: "10.00" },
      winRate: "100.0",
    },
  ],
  totals: {
    open: { opportunities: 0, value: "0.00" },
    won: { opportunities: 1, value: "10.00" },
    lost: { opportunities: 0, value: "0.00" },
    total: { opportunities: 1, value: "10.00" },
    winRate: "100.0",
  },
};

/** Responde funis e vendedores; o relatório vem de `reportResponses`. */
function mockApi(...reportResponses: Response[]) {
  let call = 0;
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/pipelines")) {
      return response([
        { id: PIPELINE_ID, name: "Funil Comercial", stages: [] },
      ]);
    }
    if (url.endsWith("/reports/sales-by-owner")) {
      return response(ownersReport);
    }
    if (url.includes("/reports/sales-by-product")) {
      const next = reportResponses[Math.min(call, reportResponses.length - 1)];
      call += 1;
      return next!;
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function reportCalls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls
    .map(call => call as unknown as [string, RequestInit])
    .filter(([url]) => String(url).includes("/reports/sales-by-product"));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.4 sales by product view", () => {
  it("renders the report table with per-situation values and totals", async () => {
    const fetchMock = mockApi(response(report));

    render(<SalesByProductView accessToken="token" />);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText("LIC — Licença PABX")).toBeVisible();
    expect(within(rows[1]!).getByText("R$ 3.500,00")).toBeVisible();
    expect(
      within(rows[1]!).getByText("Qtd. 3,5 · 2 oportunidades")
    ).toBeVisible();
    expect(within(rows[2]!).getByText("(excluído)")).toBeVisible();
    expect(within(rows[3]!).getByText("Total geral")).toBeVisible();
    expect(within(rows[3]!).getByText("R$ 6.600,00")).toBeVisible();

    const [url, init] = reportCalls(fetchMock)[0]!;
    expect(url).toMatch(/\/reports\/sales-by-product$/);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
  });

  it("applies and clears the period filter", async () => {
    const fetchMock = mockApi(response(report));

    render(<SalesByProductView accessToken="token" />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(reportCalls(fetchMock)).toHaveLength(2));
    const url = new URL(String(reportCalls(fetchMock)[1]![0]));
    expect(url.pathname).toMatch(/\/reports\/sales-by-product$/);
    expect(url.searchParams.get("from")).toBe(
      periodBoundary("2026-09-01", "start")
    );
    expect(url.searchParams.get("to")).toBe(
      periodBoundary("2026-09-30", "end")
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(reportCalls(fetchMock)).toHaveLength(3));
    expect(String(reportCalls(fetchMock)[2]![0])).toMatch(
      /\/reports\/sales-by-product$/
    );
  });

  it("rejects an inverted period without calling the API", async () => {
    const fetchMock = mockApi(response(report));

    render(<SalesByProductView accessToken="token" />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A data inicial deve ser anterior ou igual à data final."
    );
    expect(reportCalls(fetchMock)).toHaveLength(1);
  });

  it("shows the empty state and API errors", async () => {
    mockApi(
      response({
        ...report,
        items: [],
        totals: { open: empty, won: empty, lost: empty, total: empty },
      }),
      response({ code: "FORBIDDEN", message: "Permissão insuficiente." }, 403)
    );

    const { unmount } = render(<SalesByProductView accessToken="token" />);
    expect(
      await screen.findByText(
        "Nenhum item de oportunidade encontrado no período."
      )
    ).toBeVisible();
    unmount();

    render(<SalesByProductView accessToken="token" />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Exportar CSV" })
    ).not.toBeInTheDocument();
  });

  it("filters by pipeline and owner using the loaded options", async () => {
    const fetchMock = mockApi(response(report));

    render(<SalesByProductView accessToken="token" />);
    await screen.findByRole("table");

    const pipeline = screen.getByLabelText("Funil");
    const owner = screen.getByLabelText("Vendedor");
    await screen.findByRole("option", { name: "Funil Comercial" });
    expect(
      await screen.findByRole("option", { name: "Bruno Vendas (inativo)" })
    ).toBeInTheDocument();

    fireEvent.change(pipeline, { target: { value: PIPELINE_ID } });
    fireEvent.change(owner, { target: { value: OWNER_ID } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(reportCalls(fetchMock)).toHaveLength(2));
    const url = new URL(String(reportCalls(fetchMock)[1]![0]));
    expect(url.searchParams.get("pipelineId")).toBe(PIPELINE_ID);
    expect(url.searchParams.get("ownerUserId")).toBe(OWNER_ID);
    expect(url.searchParams.has("from")).toBe(false);
  });

  it("keeps the report usable when filter options fail to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).includes("/reports/sales-by-product")
          ? response(report)
          : response({ message: "Falhou." }, 500)
      )
    );

    render(<SalesByProductView accessToken="token" />);

    expect(await screen.findByRole("table")).toBeVisible();
    const pipeline = screen.getByLabelText("Funil");
    expect(within(pipeline).getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("exports the loaded report as a pt-BR CSV file", async () => {
    mockApi(response(report));
    const createObjectURL = vi.fn(() => "blob:report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL })
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<SalesByProductView accessToken="token" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Exportar CSV" })
    );

    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(link.download).toBe("vendas-por-produto-2026-09-23.csv");
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const text = await blob.text();
    expect(text).toContain("LIC;Licença PABX;Ativo;2800,00;4,000;1;3500,00");
    expect(text).toContain(";Total geral;");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    click.mockRestore();
  });
});
