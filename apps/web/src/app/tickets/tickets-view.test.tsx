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

/** C5.4: o bloco Satisfação consulta a pesquisa; o resto segue a fila do mock. */
function withSatisfaction(fetchMock: (...args: unknown[]) => unknown) {
  return (url: string, init?: RequestInit) =>
    String(url).includes("/satisfaction")
      ? Promise.resolve(response({ survey: null }))
      : fetchMock(url, init);
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
  queueId: null,
  openedAt: "2026-09-26T12:00:00.000Z",
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  version: 1,
};

const queues = [
  {
    id: "q-1",
    name: "Suporte N1",
    description: null,
    isActive: true,
    autoAssign: true,
    version: 1,
    openTicketCount: 2,
  },
  {
    id: "q-2",
    name: "Legado",
    description: "Fila antiga",
    isActive: false,
    autoAssign: false,
    version: 3,
    openTicketCount: 0,
  },
];

type Handler = (url: string, init: RequestInit) => Response | undefined;

/**
 * Mock de fetch roteado por método + caminho. Cada rota consome as
 * respostas em ordem e repete a última.
 */
function routeFetch(routes: Record<string, Response[]>, fallback?: Handler) {
  const used = new Map<string, number>();
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, "").split("?")[0];
    const key = `${method} ${path}`;
    const list = routes[key];
    if (list && list.length > 0) {
      const index = used.get(key) ?? 0;
      used.set(key, index + 1);
      return list[Math.min(index, list.length - 1)]!;
    }
    const handled = fallback?.(url, init ?? {});
    if (handled) return handled;
    // C5.4: o detalhe consulta a pesquisa de satisfação.
    if (method === "GET" && path?.endsWith("/satisfaction")) {
      return response({ survey: null });
    }
    throw new Error(`Unexpected request: ${key}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callsTo(fetchMock: ReturnType<typeof routeFetch>, fragment: string) {
  return fetchMock.mock.calls
    .map(([input, init]) => ({
      url: String(input),
      init: (init ?? {}) as RequestInit,
    }))
    .filter(call => call.url.includes(fragment));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C5.1 tickets view", () => {
  it("lists tickets and opens a new one", async () => {
    const fetchMock = routeFetch({
      "GET /support-queues": [response({ items: [] })],
      "GET /tickets": [
        response({ items: [], total: 0 }),
        response({ items: [ticket], total: 1 }),
      ],
      "POST /tickets": [response(ticket, 201)],
      "GET /tickets/t-1/events": [
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
        }),
      ],
    });

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

    const [post] = callsTo(fetchMock, "/tickets").filter(
      call => call.init.method === "POST"
    );
    expect(JSON.parse(String(post!.init.body))).toEqual({
      subject: "Ramal sem áudio",
      priority: "HIGH",
      channel: "PHONE",
    });
  });

  it("changes status with the current version and offers only valid transitions", async () => {
    const fetchMock = routeFetch({
      "GET /support-queues": [response({ items: [] })],
      "GET /tickets": [response({ items: [ticket], total: 1 })],
      "GET /tickets/t-1/events": [response({ items: [] })],
      "POST /tickets/t-1/status": [
        response({ ...ticket, status: "IN_PROGRESS", version: 2 }, 201),
      ],
    });

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
    const [call] = callsTo(fetchMock, "/tickets/t-1/status");
    expect(JSON.parse(String(call!.init.body))).toEqual({
      status: "IN_PROGRESS",
      version: 1,
    });
  });

  it("shows the satisfaction link returned by the resolution once (C5.4)", async () => {
    const url = `http://127.0.0.1:3000/avaliacao/${"Z".repeat(43)}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [ticket], total: 1 }))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(
        response(
          {
            ...ticket,
            status: "RESOLVED",
            version: 2,
            satisfactionLink: { url, expiresAt: "2026-10-03T12:00:00.000Z" },
          },
          201
        )
      )
      .mockResolvedValueOnce(response({ items: [] }));
    vi.stubGlobal("fetch", withSatisfaction(fetchMock));

    render(<TicketsView accessToken="token" canWrite />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir 2026-000001" })
    );
    const statusForm = await screen.findByRole("form", {
      name: "Alterar status",
    });
    fireEvent.change(within(statusForm).getByLabelText("Novo status"), {
      target: { value: "RESOLVED" },
    });
    fireEvent.click(
      within(statusForm).getByRole("button", { name: "Aplicar status" })
    );

    expect(await screen.findByLabelText("Link para o cliente")).toHaveValue(
      url
    );
    expect(
      screen.getByRole("region", { name: "Satisfação" })
    ).toBeInTheDocument();
  });

  it("is read-only without ticket.write", async () => {
    routeFetch({
      "GET /support-queues": [response({ items: queues })],
      "GET /tickets": [response({ items: [ticket], total: 1 })],
      "GET /tickets/t-1/events": [response({ items: [] })],
    });

    render(
      <TicketsView accessToken="token" canWrite={false} currentUserId="u-1" />
    );
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
    expect(
      screen.queryByRole("button", { name: "Assumir" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Gerenciar filas" })
    ).not.toBeInTheDocument();
  });
});

describe("C5.2 queues and assignment in the tickets view", () => {
  it("filters by queue and by 'Minhas solicitações'", async () => {
    const fetchMock = routeFetch({
      "GET /support-queues": [response({ items: queues })],
      "GET /tickets": [response({ items: [], total: 0 })],
    });

    render(<TicketsView accessToken="token" canWrite currentUserId="u-1" />);
    const filter = await screen.findByLabelText("Filtrar por fila");
    await waitFor(() =>
      expect(
        within(filter)
          .getAllByRole("option")
          .map(option => option.textContent)
      ).toEqual(["Todas", "Suporte N1", "Legado"])
    );

    fireEvent.change(filter, { target: { value: "q-1" } });
    await waitFor(() =>
      expect(
        callsTo(fetchMock, "/tickets?").some(call =>
          call.url.includes("queueId=q-1")
        )
      ).toBe(true)
    );

    const mine = screen.getByRole("button", { name: "Minhas solicitações" });
    expect(mine).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(mine);
    expect(mine).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(
        callsTo(fetchMock, "/tickets?").some(
          call =>
            call.url.includes("assigneeUserId=me") &&
            call.url.includes("queueId=q-1")
        )
      ).toBe(true)
    );
  });

  it("opens a ticket in an active queue and shows the queue in the list", async () => {
    const created = { ...ticket, queueId: "q-1", assigneeUserId: "u-2" };
    const fetchMock = routeFetch({
      "GET /support-queues": [response({ items: queues })],
      "GET /tickets": [
        response({ items: [], total: 0 }),
        response({ items: [created], total: 1 }),
      ],
      "POST /tickets": [response(created, 201)],
      "GET /tickets/t-1/events": [
        response({
          items: [
            {
              id: "e-1",
              type: "ASSIGNED",
              body: null,
              isInternal: false,
              fromStatus: null,
              toStatus: null,
              metadata: { autoAssigned: true, toAssigneeUserId: "u-2" },
              authorUserId: "u-1",
              createdAt: "2026-09-26T12:00:00.000Z",
            },
          ],
        }),
      ],
    });

    render(<TicketsView accessToken="token" canWrite currentUserId="u-1" />);
    await screen.findByText("Nenhuma solicitação encontrada.");
    fireEvent.click(screen.getByRole("button", { name: "Nova solicitação" }));
    const form = screen.getByRole("form", { name: "Nova solicitação" });
    const queueSelect = within(form).getByLabelText("Fila de atendimento");
    await waitFor(() =>
      expect(
        within(queueSelect)
          .getAllByRole("option")
          .map(option => option.textContent)
      ).toEqual(["Sem fila", "Suporte N1 (distribuição automática)"])
    );
    fireEvent.change(within(form).getByLabelText("Assunto"), {
      target: { value: "Ramal sem áudio" },
    });
    fireEvent.change(queueSelect, { target: { value: "q-1" } });
    fireEvent.click(
      within(form).getByRole("button", { name: "Abrir solicitação" })
    );

    const detail = await screen.findByRole("region", {
      name: "Solicitação 2026-000001",
    });
    expect(
      await within(detail).findByText("Atribuída automaticamente pela fila")
    ).toBeInTheDocument();
    expect(within(detail).getByText("Suporte N1")).toBeInTheDocument();
    expect(within(detail).getByText("Outro membro")).toBeInTheDocument();

    const [post] = callsTo(fetchMock, "/tickets").filter(
      call => call.init.method === "POST"
    );
    expect(JSON.parse(String(post!.init.body))).toMatchObject({
      subject: "Ramal sem áudio",
      queueId: "q-1",
    });
    const table = screen.getByRole("table");
    expect(within(table).getByText("Suporte N1")).toBeInTheDocument();
  });

  it("takes over a ticket with 'Assumir' using the current version", async () => {
    const other = { ...ticket, assigneeUserId: "u-9", version: 4 };
    const fetchMock = routeFetch({
      "GET /support-queues": [response({ items: [] })],
      "GET /tickets": [response({ items: [other], total: 1 })],
      "GET /tickets/t-1/events": [response({ items: [] })],
      "POST /tickets/t-1/assign-to-me": [
        response({ ...other, assigneeUserId: "u-1", version: 5 }),
      ],
    });

    render(<TicketsView accessToken="token" canWrite currentUserId="u-1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir 2026-000001" })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Assumir" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Assumir" })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText("Você")).toBeInTheDocument();
    const [call] = callsTo(fetchMock, "/assign-to-me");
    expect(call!.init.method).toBe("POST");
    expect(JSON.parse(String(call!.init.body))).toEqual({ version: 4 });
  });

  it("describes queue changes in the timeline", async () => {
    routeFetch({
      "GET /support-queues": [response({ items: queues })],
      "GET /tickets": [
        response({ items: [{ ...ticket, queueId: "q-1" }], total: 1 }),
      ],
      "GET /tickets/t-1/events": [
        response({
          items: [
            {
              id: "e-2",
              type: "UPDATED",
              body: null,
              isInternal: false,
              fromStatus: null,
              toStatus: null,
              metadata: {
                fields: ["queueId"],
                fromQueueId: "q-2",
                toQueueId: "q-1",
              },
              authorUserId: "u-1",
              createdAt: "2026-09-26T12:00:00.000Z",
            },
          ],
        }),
      ],
    });

    render(<TicketsView accessToken="token" canWrite currentUserId="u-1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir 2026-000001" })
    );
    expect(
      await screen.findByText("Fila: Legado → Suporte N1")
    ).toBeInTheDocument();
  });

  it("manages queues only with support.manage", async () => {
    const fetchMock = routeFetch({
      "GET /support-queues": [
        response({ items: queues }),
        response({
          items: [
            ...queues,
            {
              id: "q-3",
              name: "Financeiro",
              description: null,
              isActive: true,
              autoAssign: false,
              version: 1,
              openTicketCount: 0,
            },
          ],
        }),
      ],
      "GET /tickets": [response({ items: [], total: 0 })],
      "POST /support-queues": [response({ id: "q-3" }, 201)],
      "PATCH /support-queues/q-2": [response({ id: "q-2" })],
      "DELETE /support-queues/q-2": [response(undefined, 204)],
    });

    render(
      <TicketsView
        accessToken="token"
        canWrite
        currentUserId="u-1"
        canManageQueues
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Gerenciar filas" })
    );
    const panel = await screen.findByRole("region", {
      name: "Filas de atendimento",
    });
    await within(panel).findByText("Suporte N1");
    expect(
      within(panel).getByRole("button", { name: "Excluir Suporte N1" })
    ).toBeDisabled();

    const createForm = within(panel).getByRole("form", { name: "Nova fila" });
    fireEvent.change(within(createForm).getByLabelText("Nome da fila"), {
      target: { value: " Financeiro " },
    });
    fireEvent.click(
      within(createForm).getByLabelText("Distribuir automaticamente")
    );
    fireEvent.click(
      within(createForm).getByRole("button", { name: "Criar fila" })
    );
    await within(panel).findByText("Financeiro");
    const [create] = callsTo(fetchMock, "/support-queues").filter(
      call => call.init.method === "POST"
    );
    expect(JSON.parse(String(create!.init.body))).toEqual({
      name: "Financeiro",
      isActive: true,
      autoAssign: true,
    });

    fireEvent.click(
      within(panel).getByRole("button", { name: "Editar Legado" })
    );
    const editForm = within(panel).getByRole("form", {
      name: "Editar fila Legado",
    });
    fireEvent.click(within(editForm).getByLabelText("Fila ativa"));
    fireEvent.click(
      within(editForm).getByRole("button", { name: "Salvar fila" })
    );
    await waitFor(() =>
      expect(callsTo(fetchMock, "/support-queues/q-2")).toHaveLength(1)
    );
    const [patch] = callsTo(fetchMock, "/support-queues/q-2");
    expect(patch!.init.method).toBe("PATCH");
    expect(JSON.parse(String(patch!.init.body))).toEqual({
      name: "Legado",
      description: "Fila antiga",
      isActive: true,
      autoAssign: false,
      version: 3,
    });

    fireEvent.click(
      await within(panel).findByRole("button", { name: "Excluir Legado" })
    );
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Confirmar exclusão de Legado",
      })
    );
    await waitFor(() =>
      expect(
        callsTo(fetchMock, "/support-queues/q-2").some(
          call => call.init.method === "DELETE"
        )
      ).toBe(true)
    );
  });
});
