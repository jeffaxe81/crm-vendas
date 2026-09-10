import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivitiesView } from "./activities-view";

const accessToken = "activities-access-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const emptyActivities = { items: [], page: 1, limit: 20, total: 0 };

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function errorResponse(message: string, status = 500): Response {
  return {
    ok: false,
    status,
    json: async () => ({ message }),
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C3.5.4 activities filters", () => {
  it("switches status through the API", async () => {
    const fetchMock = vi.fn(async (_input: string | URL) =>
      response(emptyActivities)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(calls.some(url => url.includes("status=PENDING"))).toBe(true);
    });

    const completedButton = await screen.findByRole("button", {
      name: "Concluídas",
    });
    fireEvent.click(completedButton);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(calls.some(url => url.includes("status=COMPLETED"))).toBe(true);
    });
  });

  it("sends title search through the API only after submit", async () => {
    const fetchMock = vi.fn(async (_input: string | URL) =>
      response(emptyActivities)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    fetchMock.mockClear();

    const searchInput = screen.getByRole("searchbox", {
      name: "Buscar atividades",
    });
    fireEvent.change(searchInput, { target: { value: "proposta" } });

    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(calls.some(url => url.includes("q=proposta"))).toBe(true);
    });
  });

  it("renders pending activities and marks overdue items", async () => {
    const fetchMock = vi.fn(async (_input: string | URL) =>
      response({
        items: [
          {
            id: "activity-overdue",
            type: "TASK",
            status: "PENDING",
            priority: "HIGH",
            title: "Enviar proposta",
            description: "Revisar escopo comercial antes do envio.",
            ownerUserId,
            companyId: null,
            contactId: null,
            dueAt: "2000-01-01T12:00:00.000Z",
            completedAt: null,
            cancelledAt: null,
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    expect(await screen.findByText("Enviar proposta")).toBeInTheDocument();
    expect(screen.getByText("Atrasada")).toBeInTheDocument();
  });

  it("shows loading until the API responds and then the empty state", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      (_input: string | URL) =>
        new Promise<Response>(resolve => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    expect(screen.getByText("Carregando atividades...")).toBeInTheDocument();

    resolveFetch?.(response(emptyActivities));

    expect(
      await screen.findByText("Nenhuma atividade em pendentes.")
    ).toBeInTheDocument();
  });

  it("shows the API error without rendering an empty state", async () => {
    const fetchMock = vi.fn(async (_input: string | URL) =>
      errorResponse("Falha controlada ao consultar atividades.")
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Falha controlada ao consultar atividades."
    );
    expect(
      screen.queryByText("Nenhuma atividade em pendentes.")
    ).not.toBeInTheDocument();
  });

  it("creates a self-owned activity with optional commercial links", async () => {
    const companyId = "22222222-2222-4222-8222-222222222222";
    const contactId = "33333333-3333-4333-8333-333333333333";
    const createdActivity = {
      id: "44444444-4444-4444-8444-444444444444",
      type: "TASK",
      status: "PENDING",
      priority: "HIGH",
      title: "Preparar proposta",
      description: null,
      ownerUserId,
      companyId,
      contactId,
      dueAt: null,
      completedAt: null,
      cancelledAt: null,
    };
    let activitiesReads = 0;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/companies?page=1&limit=100")) {
        return response({
          items: [
            {
              id: companyId,
              legalName: "Axes Cliente Ltda",
              tradeName: "Axes Cliente",
            },
          ],
          page: 1,
          limit: 100,
          total: 1,
        });
      }

      if (url.includes("/contacts?page=1&limit=100")) {
        return response({
          items: [{ id: contactId, fullName: "Maria Cliente" }],
          page: 1,
          limit: 100,
          total: 1,
        });
      }

      if (url.endsWith("/activities") && init?.method === "POST") {
        return response(createdActivity);
      }

      if (url.includes("/activities?")) {
        activitiesReads += 1;
        return response(
          activitiesReads === 1
            ? emptyActivities
            : { items: [createdActivity], page: 1, limit: 20, total: 1 }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await screen.findByText("Nenhuma atividade em pendentes.");
    fireEvent.click(screen.getByRole("button", { name: "Nova atividade" }));

    expect(
      await screen.findByRole("form", { name: "Nova atividade" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Opportunity")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Preparar proposta" },
    });
    fireEvent.change(screen.getByLabelText("Tipo"), {
      target: { value: "TASK" },
    });
    fireEvent.change(screen.getByLabelText("Prioridade"), {
      target: { value: "HIGH" },
    });
    fireEvent.change(screen.getByLabelText("Prazo"), {
      target: { value: "2026-09-15T14:30" },
    });

    await screen.findByRole("option", { name: "Axes Cliente" });
    fireEvent.change(screen.getByLabelText("Empresa"), {
      target: { value: companyId },
    });
    fireEvent.change(screen.getByLabelText("Contato"), {
      target: { value: contactId },
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar atividade" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/activities") && init?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const payload = JSON.parse(String(postCall?.[1]?.body));
      expect(payload).toEqual({
        type: "TASK",
        priority: "HIGH",
        title: "Preparar proposta",
        ownerUserId,
        companyId,
        contactId,
        dueAt: new Date("2026-09-15T14:30").toISOString(),
      });
    });

    expect(await screen.findByText("Preparar proposta")).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Nova atividade" })
    ).not.toBeInTheDocument();
  });
});
