import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TicketsView } from "./tickets-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const ticket = {
  id: "t-1",
  protocol: "2026-000001",
  subject: "Ramal sem áudio",
  description: null,
  status: "OPEN",
  priority: "HIGH",
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C5.1 tickets view", () => {
  it("lists tickets and opens a new one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [], total: 0 }))
      .mockResolvedValueOnce(response(ticket, 201))
      .mockResolvedValueOnce(response({ items: [ticket], total: 1 }))
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: "e-1",
              type: "CREATED",
              body: null,
              isInternal: false,
              fromStatus: null,
              toStatus: "OPEN",
              authorUserId: "u-1",
              createdAt: "2026-09-26T12:00:00.000Z",
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<TicketsView accessToken="token" canWrite />);
    expect(
      await screen.findByText("Nenhuma solicitação encontrada.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nova solicitação" }));
    const form = screen.getByRole("form", { name: "Nova solicitação" });
    fireEvent.change(within(form).getByLabelText("Assunto"), {
      target: { value: "Ramal sem áudio" },
    });
    fireEvent.change(within(form).getByLabelText("Prioridade"), {
      target: { value: "HIGH" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Abrir solicitação" })
    );

    expect(
      await screen.findByRole("region", { name: "Solicitação 2026-000001" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Solicitação aberta")).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/tickets");
    expect(JSON.parse(String(init.body))).toEqual({
      subject: "Ramal sem áudio",
      priority: "HIGH",
      channel: "PHONE",
    });
  });

  it("changes status with the current version and offers only valid transitions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [ticket], total: 1 }))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(
        response({ ...ticket, status: "IN_PROGRESS", version: 2 }, 201)
      )
      .mockResolvedValueOnce(response({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TicketsView accessToken="token" canWrite />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir 2026-000001" })
    );

    const statusForm = await screen.findByRole("form", {
      name: "Alterar status",
    });
    const select = within(statusForm).getByLabelText("Novo status");
    const options = within(select)
      .getAllByRole("option")
      .map(option => option.textContent);
    expect(options).toEqual([
      "Selecione",
      "Em atendimento",
      "Aguardando cliente",
      "Resolvida",
      "Cancelada",
    ]);

    fireEvent.change(select, { target: { value: "IN_PROGRESS" } });
    fireEvent.click(
      within(statusForm).getByRole("button", { name: "Aplicar status" })
    );

    await waitFor(() =>
      expect(
        screen.getAllByText("Em atendimento").length
      ).toBeGreaterThanOrEqual(1)
    );
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toContain("/tickets/t-1/status");
    expect(JSON.parse(String(init.body))).toEqual({
      status: "IN_PROGRESS",
      version: 1,
    });
  });

  it("is read-only without ticket.write", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ items: [ticket], total: 1 }))
        .mockResolvedValueOnce(response({ items: [] }))
    );

    render(<TicketsView accessToken="token" canWrite={false} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir 2026-000001" })
    );
    await screen.findByRole("region", { name: "Solicitação 2026-000001" });
    expect(
      screen.queryByRole("button", { name: "Nova solicitação" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Alterar status" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Comentar" })
    ).not.toBeInTheDocument();
  });
});
