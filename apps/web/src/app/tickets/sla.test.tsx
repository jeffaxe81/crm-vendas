import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatSlaMinutes, worstSlaState } from "./sla-labels";
import { TicketsView } from "./tickets-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const baseTicket = {
  description: null,
  status: "OPEN",
  channel: "PHONE",
  companyId: null,
  contactId: null,
  assigneeUserId: null,
  openedAt: "2026-09-26T12:00:00.000Z",
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  version: 1,
};

const breached = {
  ...baseTicket,
  id: "t-1",
  protocol: "2026-000001",
  subject: "Link fora",
  priority: "URGENT",
  firstResponseDueAt: "2026-09-26T12:15:00.000Z",
  resolutionDueAt: "2026-09-26T13:00:00.000Z",
  sla: { firstResponse: "BREACHED", resolution: "AT_RISK" },
};

const atRisk = {
  ...baseTicket,
  id: "t-2",
  protocol: "2026-000002",
  subject: "Lentidão",
  priority: "HIGH",
  firstResponseDueAt: "2026-09-26T12:30:00.000Z",
  resolutionDueAt: "2026-09-26T16:00:00.000Z",
  sla: { firstResponse: "MET", resolution: "AT_RISK" },
};

const withoutSla = {
  ...baseTicket,
  id: "t-3",
  protocol: "2026-000003",
  subject: "Dúvida",
  priority: "LOW",
  firstResponseDueAt: null,
  resolutionDueAt: null,
  sla: { firstResponse: null, resolution: null },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C5.3 SLA helpers", () => {
  it("picks the most severe state and formats minutes", () => {
    expect(worstSlaState({ firstResponse: "MET", resolution: "AT_RISK" })).toBe(
      "AT_RISK"
    );
    expect(
      worstSlaState({ firstResponse: "BREACHED", resolution: "AT_RISK" })
    ).toBe("BREACHED");
    expect(worstSlaState({ firstResponse: null, resolution: null })).toBe(null);
    expect(worstSlaState(undefined)).toBe(null);
    expect(formatSlaMinutes(45)).toBe("45 min");
    expect(formatSlaMinutes(240)).toBe("4 h");
    expect(formatSlaMinutes(1565)).toBe("1 d 2 h 5 min");
  });
});

/** Responde às consultas auxiliares (filas C5.2 e satisfação C5.4). */
function withAuxRoutes(fetchMock: (...args: unknown[]) => unknown) {
  return (url: string, init?: RequestInit) =>
    String(url).includes("/satisfaction")
      ? Promise.resolve(response({ survey: null }))
      : String(url).includes("/support-queues")
        ? Promise.resolve(response({ items: [] }))
        : fetchMock(url, init);
}

describe("C5.3 SLA in tickets view", () => {
  it("shows SLA indicators in the list and deadlines in the detail", async () => {
    vi.stubGlobal(
      "fetch",
      withAuxRoutes(
        vi
          .fn()
          .mockResolvedValueOnce(
            response({ items: [breached, atRisk, withoutSla], total: 3 })
          )
          .mockResolvedValueOnce(response({ items: [] }))
      )
    );

    render(<TicketsView accessToken="token" canWrite={false} />);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("Vencido")).toHaveClass(
      "sla-badge--breached"
    );
    expect(within(rows[2]!).getByText("Em risco")).toHaveClass(
      "sla-badge--at_risk"
    );
    expect(within(rows[3]!).getByText("Sem SLA")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Políticas de SLA" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir 2026-000001" }));
    const detail = await screen.findByRole("region", {
      name: "Solicitação 2026-000001",
    });
    expect(within(detail).getByText("1ª resposta até")).toBeInTheDocument();
    expect(within(detail).getByText("Vencido")).toBeInTheDocument();
    expect(within(detail).getByText("Em risco")).toBeInTheDocument();
  });

  it("lets support.manage create and edit policies with version", async () => {
    const high = {
      id: "p-1",
      priority: "HIGH",
      firstResponseMinutes: 30,
      resolutionMinutes: 240,
      isActive: true,
      version: 2,
      updatedAt: "2026-09-26T12:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [], total: 0 }))
      .mockResolvedValueOnce(response({ items: [high] }))
      .mockResolvedValueOnce(
        response({ ...high, firstResponseMinutes: 20, version: 3 })
      )
      .mockResolvedValueOnce(
        response(
          {
            ...high,
            id: "p-2",
            priority: "URGENT",
            firstResponseMinutes: 15,
            resolutionMinutes: 60,
            version: 1,
          },
          201
        )
      );
    vi.stubGlobal("fetch", withAuxRoutes(fetchMock));

    render(<TicketsView accessToken="token" canWrite canManageSla />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Políticas de SLA" })
    );
    const panel = await screen.findByRole("region", {
      name: "Políticas de SLA",
    });
    const highFirst = await within(panel).findByLabelText(
      "Primeira resposta Alta (minutos)"
    );
    await waitFor(() => expect(highFirst).toHaveValue(30));

    fireEvent.change(highFirst, { target: { value: "20" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Salvar Alta" }));
    expect(await within(panel).findByRole("status")).toHaveTextContent(
      "Política Alta salva."
    );
    const [editUrl, editInit] = fetchMock.mock.calls[2] as [
      string,
      RequestInit,
    ];
    expect(editUrl).toContain("/sla-policies/HIGH");
    expect(editInit.method).toBe("PUT");
    expect(JSON.parse(String(editInit.body))).toEqual({
      firstResponseMinutes: 20,
      resolutionMinutes: 240,
      isActive: true,
      version: 2,
    });

    // Validação local: resolução menor que a 1ª resposta.
    fireEvent.change(
      within(panel).getByLabelText("Primeira resposta Urgente (minutos)"),
      { target: { value: "90" } }
    );
    fireEvent.change(
      within(panel).getByLabelText("Resolução Urgente (minutos)"),
      { target: { value: "60" } }
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Salvar Urgente" })
    );
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "O prazo de resolução deve ser maior ou igual"
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fireEvent.change(
      within(panel).getByLabelText("Primeira resposta Urgente (minutos)"),
      { target: { value: "15" } }
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Salvar Urgente" })
    );
    await within(panel).findByText("Política Urgente salva.");
    const [, createInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(JSON.parse(String(createInit.body))).toEqual({
      firstResponseMinutes: 15,
      resolutionMinutes: 60,
      isActive: true,
    });
  });
});
