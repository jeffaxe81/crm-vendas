import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ManagementSummaryView } from "./management-summary-view";
import { SlaReportView, slaReportPath } from "./sla-report-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const counts = (overrides: Record<string, unknown> = {}) => ({
  opened: 0,
  firstResponseEvaluated: 0,
  firstResponseOnTime: 0,
  firstResponseRate: null,
  resolutionEvaluated: 0,
  resolutionOnTime: 0,
  resolutionRate: null,
  breachedOpen: 0,
  ...overrides,
});

const report = {
  asOf: "2026-09-26T12:00:00.000Z",
  filters: { from: null, to: null },
  items: [
    {
      priority: "URGENT",
      ...counts({
        opened: 4,
        firstResponseEvaluated: 4,
        firstResponseOnTime: 3,
        firstResponseRate: 0.75,
        resolutionEvaluated: 2,
        resolutionOnTime: 1,
        resolutionRate: 0.5,
        breachedOpen: 2,
      }),
    },
    { priority: "HIGH", ...counts({ opened: 1 }) },
    { priority: "MEDIUM", ...counts() },
    { priority: "LOW", ...counts() },
  ],
  totals: counts({
    opened: 5,
    firstResponseEvaluated: 4,
    firstResponseOnTime: 3,
    firstResponseRate: 0.75,
    resolutionEvaluated: 2,
    resolutionOnTime: 1,
    resolutionRate: 0.5,
    breachedOpen: 2,
  }),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C5.3 SLA report view", () => {
  it("builds the query with local day boundaries", () => {
    expect(slaReportPath({ from: "", to: "" })).toBe("/reports/sla");
    const path = slaReportPath({ from: "2026-09-01", to: "2026-09-30" });
    const params = new URL(`http://x${path}`).searchParams;
    expect(params.get("from")).toBe(
      new Date("2026-09-01T00:00:00.000").toISOString()
    );
    expect(params.get("to")).toBe(
      new Date("2026-09-30T23:59:59.999").toISOString()
    );
  });

  it("renders compliance per priority and highlights breached tickets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(report))
      .mockResolvedValueOnce(response(report));
    vi.stubGlobal("fetch", fetchMock);

    render(<SlaReportView accessToken="token" />);
    const table = await screen.findByRole("table");
    const urgent = within(table).getByRole("row", { name: /Urgente/ });
    expect(urgent).toHaveTextContent("75%");
    expect(urgent).toHaveTextContent("(3/4)");
    expect(urgent).toHaveTextContent("50%");
    expect(within(urgent).getByText("vencidas")).toBeInTheDocument();
    const high = within(table).getByRole("row", { name: /Alta/ });
    expect(high).toHaveTextContent("—");

    const filters = screen.getByRole("form", {
      name: "Filtros do relatório de SLA",
    });
    fireEvent.change(within(filters).getByLabelText("De"), {
      target: { value: "2026-09-10" },
    });
    fireEvent.change(within(filters).getByLabelText("Até"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.click(within(filters).getByRole("button", { name: "Aplicar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A data inicial deve ser anterior"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(within(filters).getByLabelText("Até"), {
      target: { value: "2026-09-20" },
    });
    fireEvent.click(within(filters).getByRole("button", { name: "Aplicar" }));
    await screen.findByRole("table");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/reports/sla?from=");
  });

  it("is reachable from the SLA tab of the management summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/reports/management-summary")) {
          return response({
            asOf: "2026-09-26T12:00:00.000Z",
            openEstimatedValue: "0.00",
            pendingActivities: 0,
            overdueActivities: 0,
            undatedActivities: 0,
            opportunitiesByStage: [],
          });
        }
        if (url.includes("/reports/sla")) {
          return response(report);
        }
        throw new Error(`Unexpected request: ${url}`);
      })
    );

    render(<ManagementSummaryView accessToken="token" />);
    fireEvent.click(screen.getByRole("tab", { name: "SLA" }));
    expect(
      await screen.findByRole("heading", { name: "SLA de atendimento" })
    ).toBeInTheDocument();
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});
