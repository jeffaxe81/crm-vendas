import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgendaView } from "./agenda-view";

const ownerUserId = "33333333-3333-4333-8333-333333333333";
function activity(title: string) {
  return {
    id: title,
    title,
    type: "TASK",
    status: "PENDING",
    priority: "HIGH",
    dueAt: new Date(2026, 9, 3, 15).toISOString(),
  };
}
function setup(total = 1) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const params = new URL(String(input)).searchParams;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          activity(
            params.get("page") === "2" ? "Segundo retorno" : "Primeiro retorno"
          ),
        ],
        page: Number(params.get("page")),
        limit: 100,
        total,
      }),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<AgendaView accessToken="test-token" ownerUserId={ownerUserId} />);
  return fetchMock;
}
function latestParams(fetchMock: ReturnType<typeof setup>) {
  return new URL(String(fetchMock.mock.calls.at(-1)?.[0])).searchParams;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 3, 12));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CRM-F002 agenda focus", () => {
  it("allows retrying a failed request without showing stale work", async () => {
    const fetchMock = setup();
    await screen.findByText("Primeiro retorno");
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("Falha temporária");
    });
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha temporária"
    );
    expect(screen.queryByText("Primeiro retorno")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar agenda" }));
    expect(await screen.findByText("Primeiro retorno")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("refreshes local date boundaries after the day changes", async () => {
    const fetchMock = setup();
    await screen.findByText("Primeiro retorno");
    fireEvent.click(screen.getByRole("button", { name: "Pendentes de hoje" }));
    await waitFor(() =>
      expect(latestParams(fetchMock).get("status")).toBe("PENDING")
    );
    vi.setSystemTime(new Date(2026, 9, 4, 9));
    fireEvent.click(screen.getByRole("button", { name: "Atualizar agenda" }));
    await waitFor(() =>
      expect(latestParams(fetchMock).get("dueFrom")).toBe(
        new Date(2026, 9, 4).toISOString()
      )
    );
  });

  it("shows only today's pending work using local day boundaries", async () => {
    const fetchMock = setup();
    await screen.findByText("Primeiro retorno");
    fireEvent.click(screen.getByRole("button", { name: "Pendentes de hoje" }));
    await waitFor(() =>
      expect(latestParams(fetchMock).get("status")).toBe("PENDING")
    );
    expect(latestParams(fetchMock).get("dueFrom")).toBe(
      new Date(2026, 9, 3).toISOString()
    );
    expect(latestParams(fetchMock).get("dueTo")).toBe(
      new Date(2026, 9, 3, 23, 59, 59, 999).toISOString()
    );
    expect(latestParams(fetchMock).get("ownerUserId")).toBe(ownerUserId);
    expect(screen.getByLabelText("Status")).toBeDisabled();
  });
  it("includes pending work from all previous days, not just this week", async () => {
    const fetchMock = setup();
    await screen.findByText("Primeiro retorno");
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    await waitFor(() =>
      expect(latestParams(fetchMock).get("status")).toBe("PENDING")
    );
    expect(latestParams(fetchMock).has("dueFrom")).toBe(false);
    expect(latestParams(fetchMock).get("dueTo")).toBe(
      new Date(2026, 9, 2, 23, 59, 59, 999).toISOString()
    );
    expect(
      screen.queryByRole("button", { name: "Anterior" })
    ).not.toBeInTheDocument();
  });
  it("restores the weekly status filter after leaving a focus view", async () => {
    const fetchMock = setup();
    await screen.findByText("Primeiro retorno");
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "COMPLETED" },
    });
    await waitFor(() =>
      expect(latestParams(fetchMock).get("status")).toBe("COMPLETED")
    );
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    await waitFor(() =>
      expect(latestParams(fetchMock).get("status")).toBe("PENDING")
    );
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await waitFor(() =>
      expect(latestParams(fetchMock).get("status")).toBe("COMPLETED")
    );
    expect(screen.getByLabelText("Status")).not.toBeDisabled();
  });
  it("lets the user reach work after the first 100 records and resets pages on filtering", async () => {
    const fetchMock = setup(101);
    await screen.findByText("Primeiro retorno");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(await screen.findByText("Segundo retorno")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Próxima página" })
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Prioridade"), {
      target: { value: "HIGH" },
    });
    await waitFor(() => expect(latestParams(fetchMock).get("page")).toBe("1"));
    expect(await screen.findByText("Primeiro retorno")).toBeInTheDocument();
  });
  it("reports an empty focus view without stale activities", async () => {
    const fetchMock = setup();
    await screen.findByText("Primeiro retorno");
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ items: [], page: 1, limit: 100, total: 0 }),
        }) as Response
    );
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    expect(
      await screen.findByText("Nenhuma atividade pendente atrasada.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Primeiro retorno")).not.toBeInTheDocument();
  });
});
