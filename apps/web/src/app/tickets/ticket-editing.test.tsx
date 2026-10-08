import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TicketDetail } from "./ticket-detail";
import type { TicketRecord } from "./ticket-labels";

const ticket: TicketRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  protocol: "2026-000123",
  subject: "Ramal sem áudio",
  description: "Falha relatada pelo cliente.",
  status: "OPEN",
  priority: "MEDIUM",
  channel: "PHONE",
  companyId: null,
  contactId: null,
  assigneeUserId: null,
  queueId: "22222222-2222-4222-8222-222222222222",
  openedAt: "2026-10-08T12:00:00.000Z",
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  version: 3,
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("C5 ticket editing", () => {
  it("edits the operational ticket fields with optimistic concurrency", async () => {
    const updated: TicketRecord = {
      ...ticket,
      subject: "Ramal sem áudio — filial",
      description: "Falha confirmada na filial.",
      priority: "HIGH",
      channel: "EMAIL",
      queueId: "33333333-3333-4333-8333-333333333333",
      version: 4,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith(`/tickets/${ticket.id}/events`)) {
        return response({ items: [] });
      }

      if (url.endsWith(`/tickets/${ticket.id}`) && init?.method === "PATCH") {
        return response(updated);
      }

      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onChange = vi.fn();

    render(
      <TicketDetail
        accessToken="token"
        ticket={ticket}
        canWrite
        currentUserId="44444444-4444-4444-8444-444444444444"
        queueName="Suporte N1"
        queueNames={
          new Map([
            ["22222222-2222-4222-8222-222222222222", "Suporte N1"],
            ["33333333-3333-4333-8333-333333333333", "Suporte N2"],
          ])
        }
        onChange={onChange}
        onClose={() => undefined}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar solicitação" })
    );

    const form = screen.getByRole("form", { name: "Editar solicitação" });
    fireEvent.change(within(form).getByLabelText("Assunto"), {
      target: { value: "Ramal sem áudio — filial" },
    });
    fireEvent.change(within(form).getByLabelText("Descrição"), {
      target: { value: "Falha confirmada na filial." },
    });
    fireEvent.change(within(form).getByLabelText("Prioridade"), {
      target: { value: "HIGH" },
    });
    fireEvent.change(within(form).getByLabelText("Canal"), {
      target: { value: "EMAIL" },
    });
    fireEvent.change(within(form).getByLabelText("Fila"), {
      target: { value: "33333333-3333-4333-8333-333333333333" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Salvar alterações" })
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(updated));

    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(`/tickets/${ticket.id}`) &&
        init?.method === "PATCH"
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      subject: "Ramal sem áudio — filial",
      description: "Falha confirmada na filial.",
      priority: "HIGH",
      channel: "EMAIL",
      queueId: "33333333-3333-4333-8333-333333333333",
      version: 3,
    });
  });
});
