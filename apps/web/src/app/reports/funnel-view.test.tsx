import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { barWidth, FunnelView, funnelPath } from "./funnel-view";
import { ManagementSummaryView } from "./management-summary-view";
import { periodBoundary } from "./sales-by-product-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const pipelineA = "33333333-3333-4333-8333-333333333333";
const pipelineB = "44444444-4444-4444-8444-444444444444";

const pipelines = [
  { id: pipelineA, name: "Funil comercial", stages: [] },
  { id: pipelineB, name: "Funil parceiros", stages: [] },
];

function report(pipelineId: string, overrides: Record<string, unknown> = {}) {
  return {
    asOf: "2026-09-25T12:00:00.000Z",
    filters: { pipelineId, from: null, to: null, ownerUserId: null },
    pipeline: { id: pipelineId, name: "Funil comercial", isActive: true },
    stages: [
      {
        stageId: "11111111-1111-4111-8111-111111111111",
        name: "Prospecção",
        kind: "OPEN",
        position: 1,
        opportunities: 4,
        value: "3600.25",
      },
      {
        stageId: "22222222-2222-4222-8222-222222222222",
        name: "Ganho",
        kind: "WON",
        position: 2,
        opportunities: 2,
        value: "4500.50",
      },
      {
        stageId: "55555555-5555-4555-8555-555555555555",
        name: "Perdido",
        kind: "LOST",
        position: 3,
        opportunities: 0,
        value: "0.00",
      },
    ],
    inactiveStages: { opportunities: 1, value: "100.00" },
    totals: { opportunities: 7, value: "8200.75" },
    indicators: {
      openOpportunities: 4,
      wonOpportunities: 2,
      lostOpportunities: 1,
      winRate: "66.67",
      openValue: "3600.25",
      wonValue: "4500.50",
      lostValue: "800.00",
      averageWonTicket: "2250.25",
    },
    ...overrides,
  };
}

/** Responde /pipelines e /reports/funnel conforme a URL. */
function routedFetch(funnelBody: (url: URL) => Response) {
  return vi.fn(async (input: string) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/pipelines")) {
      return response(pipelines);
    }
    if (url.pathname.endsWith("/reports/management-summary")) {
      return response({
        asOf: "2026-09-25T12:00:00.000Z",
        openEstimatedValue: "12500.50",
        pendingActivities: 0,
        overdueActivities: 0,
        undatedActivities: 0,
        opportunitiesByStage: [],
      });
    }
    return funnelBody(url);
  });
}

function funnelCalls(fetchMock: ReturnType<typeof routedFetch>): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter(url => url.pathname.endsWith("/reports/funnel"));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.4.2 funnel view", () => {
  it("builds the query and proportional bar widths", () => {
    expect(funnelPath(pipelineA, { from: "", to: "" })).toBe(
      `/reports/funnel?pipelineId=${pipelineA}`
    );
    const url = new URL(
      `http://x${funnelPath(pipelineA, { from: "2026-09-01", to: "2026-09-30" })}`
    );
    expect(url.searchParams.get("from")).toBe(
      periodBoundary("2026-09-01", "start")
    );
    expect(url.searchParams.get("to")).toBe(
      periodBoundary("2026-09-30", "end")
    );
    expect(barWidth(4, 4)).toBe("100%");
    expect(barWidth(2, 4)).toBe("50%");
    expect(barWidth(1, 1000)).toBe("2%");
    expect(barWidth(0, 4)).toBe("0%");
    expect(barWidth(0, 0)).toBe("0%");
  });

  it("loads the first pipeline and renders stages, bars and indicators", async () => {
    const fetchMock = routedFetch(url =>
      response(report(url.searchParams.get("pipelineId")!))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<FunnelView accessToken="token" />);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(within(rows[1]!).getByText("Prospecção")).toBeVisible();
    expect(within(rows[1]!).getByText("Em aberto")).toBeVisible();
    expect(within(rows[1]!).getByText("R$ 3.600,25")).toBeVisible();
    expect(within(rows[2]!).getByRole("rowheader")).toHaveTextContent("Ganho");
    expect(within(rows[4]!).getByText("R$ 8.200,75")).toBeVisible();

    const bars = screen.getAllByTestId("funnel-bar");
    expect(bars.map(bar => bar.style.width)).toEqual(["100%", "50%", "0%"]);

    const indicators = screen.getByLabelText("Indicadores de conversão");
    expect(within(indicators).getByText("66,67%")).toBeVisible();
    expect(within(indicators).getByText("R$ 2.250,25")).toBeVisible();
    expect(within(indicators).getByText("R$ 800,00")).toBeVisible();
    expect(
      screen.getByText(/1 oportunidade em etapas desativadas/)
    ).toBeVisible();

    const [call] = funnelCalls(fetchMock);
    expect(call?.searchParams.get("pipelineId")).toBe(pipelineA);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
  });

  it("switches pipeline, applies and clears the period", async () => {
    const fetchMock = routedFetch(url =>
      response(report(url.searchParams.get("pipelineId")!))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<FunnelView accessToken="token" />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Funil"), {
      target: { value: pipelineB },
    });
    await waitFor(() => expect(funnelCalls(fetchMock)).toHaveLength(2));
    expect(funnelCalls(fetchMock)[1]?.searchParams.get("pipelineId")).toBe(
      pipelineB
    );

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(funnelCalls(fetchMock)).toHaveLength(3));
    const filtered = funnelCalls(fetchMock)[2]!;
    expect(filtered.searchParams.get("pipelineId")).toBe(pipelineB);
    expect(filtered.searchParams.get("from")).toBe(
      periodBoundary("2026-09-01", "start")
    );
    expect(filtered.searchParams.get("to")).toBe(
      periodBoundary("2026-09-30", "end")
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(funnelCalls(fetchMock)).toHaveLength(4));
    expect(funnelCalls(fetchMock)[3]?.searchParams.has("from")).toBe(false);
  });

  it("rejects an inverted period and shows null indicators as a dash", async () => {
    const fetchMock = routedFetch(url =>
      response(
        report(url.searchParams.get("pipelineId")!, {
          inactiveStages: { opportunities: 0, value: "0.00" },
          indicators: {
            openOpportunities: 0,
            wonOpportunities: 0,
            lostOpportunities: 0,
            winRate: null,
            openValue: "0.00",
            wonValue: "0.00",
            lostValue: "0.00",
            averageWonTicket: null,
          },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<FunnelView accessToken="token" />);
    await screen.findByRole("table");

    const indicators = screen.getByLabelText("Indicadores de conversão");
    expect(within(indicators).getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText(/etapas desativadas/)).not.toBeInTheDocument();

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
    expect(funnelCalls(fetchMock)).toHaveLength(1);
  });

  it("shows API errors and the no-pipeline state", async () => {
    const failing = routedFetch(() =>
      response(
        { code: "PIPELINE_NOT_FOUND", message: "Funil não encontrado." },
        404
      )
    );
    vi.stubGlobal("fetch", failing);
    const { unmount } = render(<FunnelView accessToken="token" />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    unmount();

    const noPipelines = vi.fn(async () => response([]));
    vi.stubGlobal("fetch", noPipelines);
    render(<FunnelView accessToken="token" />);
    expect(
      await screen.findByText("Nenhum funil ativo encontrado.")
    ).toBeVisible();
    expect(noPipelines).toHaveBeenCalledTimes(1);
  });

  it("is reachable as the Funil tab of the management summary", async () => {
    const fetchMock = routedFetch(url =>
      response(report(url.searchParams.get("pipelineId")!))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ManagementSummaryView accessToken="token" />);
    await screen.findByText("R$ 12.500,50");
    expect(funnelCalls(fetchMock)).toHaveLength(0);

    const tab = screen.getByRole("tab", { name: "Funil" });
    fireEvent.click(tab);
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByRole("heading", { name: "Funil e conversão" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Prospecção")).toBeInTheDocument();
    expect(screen.queryByText("R$ 12.500,50")).not.toBeInTheDocument();
  });
});
