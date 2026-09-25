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
  ActivitiesByOwnerView,
  formatCompletionRate,
} from "./activities-by-owner-view";
import { ManagementSummaryView } from "./management-summary-view";
import { periodBoundary } from "./sales-by-product-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const counts = (
  total: number,
  completed: number,
  pending: number,
  overdue: number,
  completedOnTime: number,
  task: number,
  appointment: number
) => ({
  total,
  completed,
  pending,
  cancelled: total - completed - pending,
  overdue,
  completedOnTime,
  completionRate: total === 0 ? null : completed / total,
  byType: { TASK: task, APPOINTMENT: appointment },
});

const report = {
  asOf: "2026-09-23T12:00:00.000Z",
  filters: { from: null, to: null, type: null },
  items: [
    {
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      ownerDisplayName: "Bruno Vendedor",
      ownerActive: true,
      ...counts(3, 3, 0, 0, 3, 0, 3),
    },
    {
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      ownerDisplayName: "Ana Admin",
      ownerActive: true,
      ...counts(8, 2, 5, 2, 1, 7, 1),
    },
    {
      ownerUserId: "33333333-3333-4333-8333-333333333333",
      ownerDisplayName: "Duda Inativa",
      ownerActive: false,
      ...counts(0, 0, 0, 0, 0, 0, 0),
    },
  ],
  totals: counts(11, 5, 5, 2, 4, 7, 4),
};

const summary = {
  asOf: "2026-09-23T12:00:00.000Z",
  opportunitiesByStage: [],
  openEstimatedValue: "0.00",
  pendingActivities: 0,
  overdueActivities: 0,
  undatedActivities: 0,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.4.3 activities by owner view", () => {
  it("formats the completion rate and the empty rate", () => {
    expect(formatCompletionRate(0.25)).toBe("25%");
    expect(formatCompletionRate(2 / 7)).toBe("28,6%");
    expect(formatCompletionRate(null)).toBe("—");
  });

  it("renders the table per owner with overdue highlight and totals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(report));
    vi.stubGlobal("fetch", fetchMock);

    render(<ActivitiesByOwnerView accessToken="token" />);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(5);

    const [, bruno, ana, duda, total] = rows as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(within(bruno).getByText("Bruno Vendedor")).toBeVisible();
    expect(within(bruno).getByText("100%")).toBeVisible();
    expect(within(bruno).queryByText("atrasadas")).not.toBeInTheDocument();
    expect(bruno).not.toHaveClass("activities-report__row--overdue");

    expect(ana).toHaveClass("activities-report__row--overdue");
    expect(within(ana).getByText("atrasadas")).toBeVisible();
    expect(within(ana).getByText("25%")).toBeVisible();
    expect(within(ana).getByText("7 / 1")).toBeVisible();

    expect(within(duda).getByText("(inativo)")).toBeVisible();
    expect(within(duda).getByText("—")).toBeVisible();

    expect(within(total).getByText("Total geral")).toBeVisible();
    expect(within(total).getByText("7 / 4")).toBeVisible();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/reports\/activities-by-owner$/);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
  });

  it("applies and clears the period and type filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(report));
    vi.stubGlobal("fetch", fetchMock);

    render(<ActivitiesByOwnerView accessToken="token" />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.change(screen.getByLabelText("Tipo"), {
      target: { value: "APPOINTMENT" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(url.pathname).toMatch(/\/reports\/activities-by-owner$/);
    expect(url.searchParams.get("from")).toBe(
      periodBoundary("2026-09-01", "start")
    );
    expect(url.searchParams.get("to")).toBe(
      periodBoundary("2026-09-30", "end")
    );
    expect(url.searchParams.get("type")).toBe("APPOINTMENT");

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(String(fetchMock.mock.calls[2]![0])).toMatch(
      /\/reports\/activities-by-owner$/
    );
    expect(screen.getByLabelText("Tipo")).toHaveValue("");
  });

  it("rejects an inverted period without calling the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(report));
    vi.stubGlobal("fetch", fetchMock);

    render(<ActivitiesByOwnerView accessToken="token" />);
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
        response({ ...report, items: [], totals: counts(0, 0, 0, 0, 0, 0, 0) })
      )
      .mockResolvedValueOnce(
        response({ code: "FORBIDDEN", message: "Permissão insuficiente." }, 403)
      );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<ActivitiesByOwnerView accessToken="token" />);
    expect(
      await screen.findByText("Nenhuma atividade encontrada no período.")
    ).toBeVisible();
    unmount();

    render(<ActivitiesByOwnerView accessToken="token" />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("opens from the Atividades tab of the management summary", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/reports/management-summary")) {
        return response(summary);
      }
      if (url.includes("/reports/activities-by-owner")) {
        return response(report);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ManagementSummaryView accessToken="token" />);
    await screen.findByText("Nenhuma oportunidade ativa encontrada.");

    const tab = screen.getByRole("tab", { name: "Atividades" });
    expect(tab).toHaveAttribute("aria-selected", "false");
    fireEvent.click(tab);

    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByRole("heading", { name: "Atividades por responsável" })
    ).toBeVisible();
    expect(await screen.findByText("Ana Admin")).toBeVisible();
  });
});
