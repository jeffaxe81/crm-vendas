import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CsatView, csatPath, formatCsatPercent } from "./csat-view";
import { ManagementSummaryView } from "./management-summary-view";
import { periodBoundary } from "./sales-by-product-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const report = {
  asOf: "2026-09-26T12:00:00.000Z",
  filters: { from: null, to: null },
  sent: 8,
  responded: 5,
  responseRate: 0.625,
  averageRating: 3.6,
  distribution: { "1": 1, "2": 0, "3": 1, "4": 1, "5": 2 },
  csat: 0.6,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C5.4 CSAT report view", () => {
  it("builds the report path with local-day boundaries", () => {
    expect(csatPath({ from: "", to: "" })).toBe("/reports/csat");
    const path = csatPath({ from: "2026-09-01", to: "2026-09-30" });
    const params = new URL(`http://x${path}`).searchParams;
    expect(params.get("from")).toBe(periodBoundary("2026-09-01", "start"));
    expect(params.get("to")).toBe(periodBoundary("2026-09-30", "end"));
    expect(formatCsatPercent(null)).toBe("—");
    expect(formatCsatPercent(0.6)).toBe("60%");
  });

  it("shows CSAT, averages and the 1–5 distribution", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(report)));
    render(<CsatView accessToken="token" />);

    const cards = await screen.findByLabelText("Indicadores de satisfação");
    expect(within(cards).getByText("CSAT").nextSibling).toHaveTextContent(
      "60%"
    );
    expect(within(cards).getByText("Nota média").nextSibling).toHaveTextContent(
      "3,6"
    );
    expect(within(cards).getByText("Enviadas").nextSibling).toHaveTextContent(
      "8"
    );
    expect(
      within(cards).getByText("Taxa de resposta").nextSibling
    ).toHaveTextContent("62,5%");

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("5240%");
    expect(rows[5]).toHaveTextContent("1120%");
  });

  it("applies and validates the period filter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(report))
      .mockResolvedValueOnce(
        response({
          ...report,
          sent: 0,
          responded: 0,
          responseRate: null,
          averageRating: null,
          csat: null,
          distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<CsatView accessToken="token" />);
    await screen.findByLabelText("Indicadores de satisfação");

    const form = screen.getByRole("form", { name: "Filtros de satisfação" });
    fireEvent.change(within(form).getByLabelText("De"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.change(within(form).getByLabelText("Até"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Aplicar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A data inicial deve ser anterior ou igual à data final."
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(within(form).getByLabelText("Até"), {
      target: { value: "2026-10-31" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Aplicar" }));
    expect(
      await screen.findByText("Nenhuma pesquisa de satisfação no período.")
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/reports/csat?from="
    );
  });

  it("opens as the Satisfação tab in the management summary", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        String(url).includes("/reports/csat")
          ? response(report)
          : response({
              asOf: "2026-09-26T12:00:00.000Z",
              openEstimatedValue: "0.00",
              pendingActivities: 0,
              overdueActivities: 0,
              undatedActivities: 0,
              opportunitiesByStage: [],
            })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ManagementSummaryView accessToken="token" />);

    const tab = screen.getByRole("tab", { name: "Satisfação" });
    fireEvent.click(tab);
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByRole("heading", { name: "Satisfação do atendimento" })
    ).toBeInTheDocument();
  });
});
