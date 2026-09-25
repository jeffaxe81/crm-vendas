import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { periodBoundary } from "./report-filters";
import {
  formatWinRate,
  salesByOwnerPath,
  SalesByOwnerView,
} from "./sales-by-owner-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const PIPELINE_ID = "44444444-4444-4444-8444-444444444444";
const bucket = (opportunities: number, value: string) => ({
  opportunities,
  value,
});
const empty = bucket(0, "0.00");

const report = {
  asOf: "2026-09-25T12:00:00.000Z",
  filters: { from: null, to: null, pipelineId: null },
  items: [
    {
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      ownerName: "Ana Vendas",
      ownerActive: true,
      open: bucket(2, "7100.00"),
      won: bucket(1, "2500.50"),
      lost: empty,
      total: bucket(3, "9600.50"),
      winRate: "100.0",
    },
    {
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      ownerName: "Bruno Vendas",
      ownerActive: false,
      open: bucket(1, "300.00"),
      won: empty,
      lost: empty,
      total: bucket(1, "300.00"),
      winRate: null,
    },
  ],
  totals: {
    open: bucket(3, "7400.00"),
    won: bucket(1, "2500.50"),
    lost: empty,
    total: bucket(4, "9900.50"),
    winRate: "100.0",
  },
};

function mockApi(...reportResponses: Response[]) {
  let call = 0;
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/pipelines")) {
      return response([
        { id: PIPELINE_ID, name: "Funil Comercial", stages: [] },
      ]);
    }
    if (url.includes("/reports/sales-by-owner")) {
      const next = reportResponses[Math.min(call, reportResponses.length - 1)];
      call += 1;
      return next!;
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function reportUrls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls
    .map(call => String((call as unknown as [string])[0]))
    .filter(url => url.includes("/reports/sales-by-owner"));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.5 sales by owner helpers", () => {
  it("formats win rates and never sends an owner filter", () => {
    expect(formatWinRate("66.7")).toBe("66,7%");
    expect(formatWinRate(null)).toBe("—");
    expect(
      salesByOwnerPath({ ownerUserId: "x", pipelineId: PIPELINE_ID })
    ).toBe(`/reports/sales-by-owner?pipelineId=${PIPELINE_ID}`);
    expect(salesByOwnerPath({})).toBe("/reports/sales-by-owner");
  });
});

describe("C4.5 sales by owner view", () => {
  it("renders owners, win rate, inactive marker and totals", async () => {
    const fetchMock = mockApi(response(report));

    render(<SalesByOwnerView accessToken="token" />);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText("Ana Vendas")).toBeVisible();
    expect(within(rows[1]!).getByText("R$ 2.500,50")).toBeVisible();
    expect(within(rows[1]!).getByText("100,0%")).toBeVisible();
    expect(within(rows[2]!).getByText("(inativo)")).toBeVisible();
    expect(within(rows[2]!).getByText("—")).toBeVisible();
    expect(within(rows[3]!).getByText("Total geral")).toBeVisible();
    expect(within(rows[3]!).getByText("R$ 9.900,50")).toBeVisible();
    expect(screen.queryByLabelText("Vendedor")).not.toBeInTheDocument();
    expect(reportUrls(fetchMock)).toHaveLength(1);
  });

  it("applies period and pipeline filters and rejects inverted periods", async () => {
    const fetchMock = mockApi(response(report));

    render(<SalesByOwnerView accessToken="token" />);
    await screen.findByRole("table");
    await screen.findByRole("option", { name: "Funil Comercial" });

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
    expect(reportUrls(fetchMock)).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.change(screen.getByLabelText("Funil"), {
      target: { value: PIPELINE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(reportUrls(fetchMock)).toHaveLength(2));
    const url = new URL(reportUrls(fetchMock)[1]!);
    expect(url.searchParams.get("from")).toBe(
      periodBoundary("2026-09-01", "start")
    );
    expect(url.searchParams.get("to")).toBe(
      periodBoundary("2026-09-30", "end")
    );
    expect(url.searchParams.get("pipelineId")).toBe(PIPELINE_ID);

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(reportUrls(fetchMock)).toHaveLength(3));
    expect(reportUrls(fetchMock)[2]).toMatch(/\/reports\/sales-by-owner$/);
  });

  it("shows the empty state and API errors", async () => {
    mockApi(
      response({
        ...report,
        items: [],
        totals: {
          open: empty,
          won: empty,
          lost: empty,
          total: empty,
          winRate: null,
        },
      }),
      response({ code: "FORBIDDEN", message: "Permissão insuficiente." }, 403)
    );

    const { unmount } = render(<SalesByOwnerView accessToken="token" />);
    expect(
      await screen.findByText("Nenhuma oportunidade encontrada no período.")
    ).toBeVisible();
    unmount();

    render(<SalesByOwnerView accessToken="token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Permissão insuficiente."
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("exports the report as CSV", async () => {
    mockApi(response(report));
    const createObjectURL = vi.fn(() => "blob:owners");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL })
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<SalesByOwnerView accessToken="token" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Exportar CSV" })
    );

    const link = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(link.download).toBe("vendas-por-vendedor-2026-09-25.csv");
    const text = await (
      createObjectURL.mock.calls[0] as unknown as [Blob]
    )[0].text();
    expect(text).toContain(
      "Ana Vendas;Ativo;7100,00;2;2500,50;1;0,00;0;9600,50;3;100,0"
    );
    expect(text).toContain(
      "Bruno Vendas;Inativo;300,00;1;0,00;0;0,00;0;300,00;1;"
    );
    click.mockRestore();
  });
});
