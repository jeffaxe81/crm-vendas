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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.4 sales by product view", () => {
  it("renders the report table with per-situation values and totals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(report));
    vi.stubGlobal("fetch", fetchMock);

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

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/reports\/sales-by-product$/);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
  });

  it("applies and clears the period filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(report));
    vi.stubGlobal("fetch", fetchMock);

    render(<SalesByProductView accessToken="token" />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(url.pathname).toMatch(/\/reports\/sales-by-product$/);
    expect(url.searchParams.get("from")).toBe(
      periodBoundary("2026-09-01", "start")
    );
    expect(url.searchParams.get("to")).toBe(
      periodBoundary("2026-09-30", "end")
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(String(fetchMock.mock.calls[2]![0])).toMatch(
      /\/reports\/sales-by-product$/
    );
  });

  it("rejects an inverted period without calling the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(report));
    vi.stubGlobal("fetch", fetchMock);

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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state and API errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          ...report,
          items: [],
          totals: { open: empty, won: empty, lost: empty, total: empty },
        })
      )
      .mockResolvedValueOnce(
        response({ code: "FORBIDDEN", message: "Permissão insuficiente." }, 403)
      );
    vi.stubGlobal("fetch", fetchMock);

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
  });
});
