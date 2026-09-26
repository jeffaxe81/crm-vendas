import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatWinRate,
  salesByMonthPath,
  SalesByMonthView,
} from "./sales-by-month-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const PIPELINE_ID = "55555555-5555-4555-8555-555555555555";
const bucket = (opportunities: number, value: string) => ({
  opportunities,
  value,
});
const empty = bucket(0, "0.00");

function monthRow(month: number) {
  return {
    month,
    open: empty,
    won: empty,
    lost: empty,
    total: empty,
    winRate: null as string | null,
  };
}

const report = {
  asOf: "2026-09-25T12:00:00.000Z",
  filters: { year: 2026, pipelineId: null },
  items: Array.from({ length: 12 }, (_, index) => monthRow(index + 1)).map(
    row =>
      row.month === 3
        ? {
            ...row,
            open: bucket(1, "800.00"),
            won: bucket(1, "2400.00"),
            total: bucket(2, "3200.00"),
            winRate: "100.0",
          }
        : row
  ),
  totals: {
    open: bucket(1, "800.00"),
    won: bucket(1, "2400.00"),
    lost: empty,
    total: bucket(2, "3200.00"),
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
    if (url.includes("/reports/sales-by-month")) {
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
    .filter(url => url.includes("/reports/sales-by-month"));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.6 sales by month helpers", () => {
  it("formats win rates and always sends the selected year", () => {
    expect(formatWinRate("66.7")).toBe("66,7%");
    expect(formatWinRate(null)).toBe("—");
    expect(salesByMonthPath({ year: 2026 })).toBe(
      "/reports/sales-by-month?year=2026"
    );
    expect(salesByMonthPath({ year: 2026, pipelineId: PIPELINE_ID })).toBe(
      `/reports/sales-by-month?year=2026&pipelineId=${PIPELINE_ID}`
    );
  });
});

describe("C4.6 sales by month view", () => {
  it("renders all 12 months, highlights March and shows the year total", async () => {
    const fetchMock = mockApi(response(report));

    render(<SalesByMonthView accessToken="token" />);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    // cabeçalho + 12 meses + total = 14
    expect(rows).toHaveLength(14);
    expect(within(rows[3]!).getByText("Março")).toBeVisible();
    expect(within(rows[3]!).getByText("R$ 2.400,00")).toBeVisible();
    expect(within(rows[3]!).getByText("100,0%")).toBeVisible();
    expect(within(rows[13]!).getByText("Total do ano")).toBeVisible();
    expect(within(rows[13]!).getByText("R$ 3.200,00")).toBeVisible();
    expect(reportUrls(fetchMock)).toHaveLength(1);
    expect(reportUrls(fetchMock)[0]).toMatch(/year=\d{4}/);
  });

  it("applies year and pipeline filters and resets on clear", async () => {
    const fetchMock = mockApi(response(report));

    render(<SalesByMonthView accessToken="token" />);
    await screen.findByRole("table");
    await screen.findByRole("option", { name: "Funil Comercial" });

    fireEvent.change(screen.getByLabelText("Ano"), {
      target: { value: "2025" },
    });
    fireEvent.change(screen.getByLabelText("Funil"), {
      target: { value: PIPELINE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(reportUrls(fetchMock)).toHaveLength(2));
    const url = new URL(reportUrls(fetchMock)[1]!, "http://localhost");
    expect(url.searchParams.get("year")).toBe("2025");
    expect(url.searchParams.get("pipelineId")).toBe(PIPELINE_ID);

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(reportUrls(fetchMock)).toHaveLength(3));
    const clearedUrl = new URL(reportUrls(fetchMock)[2]!, "http://localhost");
    expect(clearedUrl.searchParams.get("pipelineId")).toBeNull();
  });

  it("shows API errors", async () => {
    mockApi(
      response({ code: "FORBIDDEN", message: "Permissão insuficiente." }, 403)
    );

    render(<SalesByMonthView accessToken="token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Permissão insuficiente."
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("exports the report as CSV", async () => {
    mockApi(response(report));
    const createObjectURL = vi.fn(() => "blob:months");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL })
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<SalesByMonthView accessToken="token" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Exportar CSV" })
    );

    const link = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(link.download).toBe("vendas-por-periodo-2026.csv");
    const text = await (
      createObjectURL.mock.calls[0] as unknown as [Blob]
    )[0].text();
    expect(text).toContain("Março de 2026;800,00;1;2400,00;1;0,00;0");
    click.mockRestore();
  });
});
