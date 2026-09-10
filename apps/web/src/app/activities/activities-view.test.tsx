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

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function emptyList() {
  return { items: [], page: 1, limit: 20, total: 0 };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C3.5.4 activities list and filters", () => {
  it("loads pending activities by default and switches status through the API", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/activities?")) {
        return response(emptyList());
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("status=PENDING")
        )
      ).toBe(true);
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Concluídas" })
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("status=COMPLETED")
        )
      ).toBe(true);
    });
  });

  it("sends the search term to the API", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/activities?")) {
        return response(emptyList());
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await screen.findByText("Nenhuma atividade pendente.");
    fireEvent.change(screen.getByLabelText("Buscar atividades"), {
      target: { value: "proposta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("q=proposta")
        )
      ).toBe(true);
    });
  });

  it("renders returned activity data and marks overdue pending work", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/activities?")) {
        return response({
          items: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              type: "TASK",
              status: "PENDING",
              priority: "HIGH",
              title: "Retornar proposta",
              description: "Confirmar condições comerciais",
              companyId: null,
              contactId: null,
              ownerUserId,
              dueAt: "2020-01-01T12:00:00.000Z",
              completedAt: null,
              cancelledAt: null,
            },
          ],
          page: 1,
          limit: 20,
          total: 1,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    expect(await screen.findByText("Retornar proposta")).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getByText("Vencida")).toBeInTheDocument();
  });

  it("shows a safe API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ message: "Falha segura ao carregar." }, 500))
    );

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha segura ao carregar."
    );
  });
});
