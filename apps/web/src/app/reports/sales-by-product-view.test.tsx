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
  periodBoundary,
  salesByProductExportPath,
  SalesByProductView,
} from "./sales-by-product-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

const PIPELINE_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_ID = "44444444-4444-4444-8444-444444444444";
const pipelines = [
  { id: PIPELINE_ID, name: "Funil Corporativo", isActive: true, stages: [] },
];
const owners = [
  { userId: OWNER_ID, displayName: "Ana Vendas", membershipActive: true },
  {
    userId: "55555555-5555-4555-8555-555555555555",
    displayName: "Bruno Antigo",
    membershipActive: false,
  },
];

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;

/** Responde por caminho: funis, responsáveis, exportação e relatório. */
function routedFetch(routes: {
  report?: Route;
  pipelines?: Route;
  owners?: Route;
  exportCsv?: Route;
}) {
  return vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/pipelines")) {
      return (routes.pipelines ?? (() => response(pipelines)))(url, init);
    }
    if (url.pathname.endsWith("/reports/sales-by-product/owners")) {
      return (routes.owners ?? (() => response(owners)))(url, init);
    }
    if (url.pathname.endsWith("/reports/sales-by-product/export")) {
      if (!routes.exportCsv) {
        throw new Error("unexpected export");
      }
      return routes.exportCsv(url, init);
    }
    return (routes.report ?? (() => response(report)))(url, init);
  });
}

function reportCalls(fetchMock: ReturnType<typeof routedFetch>): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter(url => url.pathname.endsWith("/reports/sales-by-product"));
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

const { createObjectURL, revokeObjectURL } = URL;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

describe("C4.4 sales by product view", () => {
  it("renders the report table with per-situation values and totals", async () => {
    const fetchMock = routedFetch({});
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

    const reportCall = fetchMock.mock.calls.find(([input]) =>
      /\/reports\/sales-by-product$/.test(String(input))
    ) as [string, RequestInit];
    expect(new Headers(reportCall[1].headers).get("Authorization")).toBe(
      "Bearer token"
    );
  });

  it("applies and clears the period filter", async () => {
    const fetchMock = routedFetch({});
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

    await waitFor(() => expect(reportCalls(fetchMock)).toHaveLength(2));
    const url = reportCalls(fetchMock)[1]!;
    expect(url.searchParams.get("from")).toBe(
      periodBoundary("2026-09-01", "start")
    );
    expect(url.searchParams.get("to")).toBe(
      periodBoundary("2026-09-30", "end")
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(reportCalls(fetchMock)).toHaveLength(3));
    expect(reportCalls(fetchMock)[2]!.search).toBe("");
  });

  it("rejects an inverted period without calling the API", async () => {
    const fetchMock = routedFetch({});
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
    expect(reportCalls(fetchMock)).toHaveLength(1);
  });

  it("shows the empty state and API errors", async () => {
    const reportRoute = vi
      .fn()
      .mockReturnValueOnce(
        response({
          ...report,
          items: [],
          totals: { open: empty, won: empty, lost: empty, total: empty },
        })
      )
      .mockReturnValueOnce(
        response({ code: "FORBIDDEN", message: "Permissão insuficiente." }, 403)
      );
    vi.stubGlobal("fetch", routedFetch({ report: reportRoute }));

    const { unmount } = render(<SalesByProductView accessToken="token" />);
    expect(
      await screen.findByText(
        "Nenhum item de oportunidade encontrado com os filtros aplicados."
      )
    ).toBeVisible();
    unmount();

    render(<SalesByProductView accessToken="token" />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("sends pipeline and owner filters to the API", async () => {
    const fetchMock = routedFetch({});
    vi.stubGlobal("fetch", fetchMock);

    render(<SalesByProductView accessToken="token" />);
    await screen.findByRole("table");

    const pipelineSelect = screen.getByLabelText("Funil");
    const ownerSelect = screen.getByLabelText("Responsável");
    expect(
      await within(pipelineSelect).findByRole("option", {
        name: "Funil Corporativo",
      })
    ).toBeInTheDocument();
    expect(
      within(ownerSelect).getByRole("option", {
        name: "Bruno Antigo (inativo)",
      })
    ).toBeInTheDocument();

    fireEvent.change(pipelineSelect, { target: { value: PIPELINE_ID } });
    fireEvent.change(ownerSelect, { target: { value: OWNER_ID } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(reportCalls(fetchMock)).toHaveLength(2));
    const url = reportCalls(fetchMock)[1]!;
    expect(url.searchParams.get("pipelineId")).toBe(PIPELINE_ID);
    expect(url.searchParams.get("ownerUserId")).toBe(OWNER_ID);
    expect(url.searchParams.has("from")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(reportCalls(fetchMock)).toHaveLength(3));
    expect(reportCalls(fetchMock)[2]!.search).toBe("");
    expect(pipelineSelect).toHaveValue("");
    expect(ownerSelect).toHaveValue("");
  });

  it("keeps the report usable when filter options fail to load", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch({
        owners: () => response({ message: "Permissão insuficiente." }, 403),
      })
    );

    render(<SalesByProductView accessToken="token" />);

    expect(await screen.findByRole("table")).toBeVisible();
    expect(
      await screen.findByText(
        "Não foi possível carregar todas as opções de funil e responsável."
      )
    ).toBeVisible();
    expect(
      await within(screen.getByLabelText("Funil")).findByRole("option", {
        name: "Funil Corporativo",
      })
    ).toBeInTheDocument();
  });

  it("downloads the CSV with the applied filters and bearer token", async () => {
    const csvBlob = new Blob(["\uFEFFCódigo;Produto"], {
      type: "text/csv;charset=utf-8",
    });
    const exportRoute = vi.fn(
      () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers({
            "Content-Disposition":
              'attachment; filename="vendas-por-produto-2026-09-25.csv"',
          }),
          blob: async () => csvBlob,
        }) as unknown as Response
    );
    const fetchMock = routedFetch({ exportCsv: exportRoute });
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn(() => "blob:sales-csv");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked.push(this);
    });

    render(<SalesByProductView accessToken="token" />);
    await screen.findByRole("table");
    await within(screen.getByLabelText("Funil")).findByRole("option", {
      name: "Funil Corporativo",
    });

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Funil"), {
      target: { value: PIPELINE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(reportCalls(fetchMock)).toHaveLength(2));
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    const [exportUrl, init] = exportRoute.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(`${exportUrl.pathname}${exportUrl.search}`).toMatch(
      new RegExp(
        `${salesByProductExportPath({
          from: "2026-09-01",
          to: "",
          pipelineId: PIPELINE_ID,
        }).replace(/[?]/g, "\\?")}$`
      )
    );
    expect(exportUrl.searchParams.get("from")).toBe(
      periodBoundary("2026-09-01", "start")
    );
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
    expect(createObjectURL).toHaveBeenCalledWith(csvBlob);
    expect(clicked[0]!.download).toBe("vendas-por-produto-2026-09-25.csv");
    expect(clicked[0]!.href).toBe("blob:sales-csv");
    expect(clicked[0]!.isConnected).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sales-csv");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error when the export fails", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch({
        exportCsv: () => response({ message: "Permissão insuficiente." }, 403),
      })
    );

    render(<SalesByProductView accessToken="token" />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Permissão insuficiente."
    );
  });
});
