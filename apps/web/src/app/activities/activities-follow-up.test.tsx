import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivitiesView } from "./activities-view";

const ownerUserId = "11111111-1111-4111-8111-111111111111";

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

const followUp = {
  id: "22222222-2222-4222-8222-222222222222",
  type: "FOLLOW_UP",
  status: "PENDING",
  priority: "HIGH",
  title: "Retornar contrato",
  description: null,
  ownerUserId,
  companyId: null,
  contactId: null,
  dueAt: "2000-01-01T12:00:00.000Z",
  completedAt: null,
  cancelledAt: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4 ACT-003 follow-up nas atividades", () => {
  it("mostra follow-up vencido e filtra por tipo sem ocultar o atraso", async () => {
    const fetchMock = vi.fn(async () =>
      response({
        items: [
          followUp,
          { ...followUp, id: "task", type: "TASK", title: "Tarefa regular" },
        ],
        page: 1,
        limit: 20,
        total: 2,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken="test-token"
        ownerUserId={ownerUserId}
        canWrite={false}
      />
    );

    expect(await screen.findByText("Retornar contrato")).toBeInTheDocument();
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filtrar tipo"), {
      target: { value: "FOLLOW_UP" },
    });
    expect(screen.getByText("Retornar contrato")).toBeInTheDocument();
    expect(screen.queryByText("Tarefa regular")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filtrar prazo"), {
      target: { value: "overdue" },
    });
    expect(screen.getByText("Atrasada")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("envia FOLLOW_UP na criação usando o CRUD atual", async () => {
    let created = false;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/companies?") || url.includes("/contacts?")) {
        return response({ items: [], page: 1, limit: 100, total: 0 });
      }
      if (url.endsWith("/activities") && init?.method === "POST") {
        created = true;
        return response(followUp);
      }
      if (url.includes("/activities?")) {
        return response({
          items: created ? [followUp] : [],
          page: 1,
          limit: 20,
          total: created ? 1 : 0,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ActivitiesView
        accessToken="test-token"
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await screen.findByText("Nenhuma atividade em pendentes.");
    fireEvent.click(screen.getByRole("button", { name: "Nova atividade" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Retornar contrato" },
    });
    fireEvent.change(screen.getByLabelText("Tipo"), {
      target: { value: "FOLLOW_UP" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar atividade" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/activities") && init?.method === "POST"
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        type: "FOLLOW_UP",
        title: "Retornar contrato",
        ownerUserId,
      });
    });
  });
});
