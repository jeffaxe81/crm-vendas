import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgendaView } from "./agenda-view";

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

const agendaPayload = {
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      type: "TASK",
      status: "PENDING",
      priority: "HIGH",
      title: "Retornar proposta",
      dueAt: "2026-09-14T13:00:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      type: "APPOINTMENT",
      status: "PENDING",
      priority: "MEDIUM",
      title: "Reunião comercial",
      dueAt: "2026-09-15T16:00:00.000Z",
    },
  ],
  page: 1,
  limit: 100,
  total: 2,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("C4.1 AgendaView", () => {
  it("loads a weekly window and applies activity filters", async () => {
    const fetchMock = vi.fn(async (_input: string | URL) =>
      response(agendaPayload)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AgendaView
        accessToken="test-token"
        ownerUserId="33333333-3333-4333-8333-333333333333"
      />
    );

    expect(await screen.findByText("Retornar proposta")).toBeInTheDocument();
    expect(screen.getByText("Reunião comercial")).toBeInTheDocument();

    await waitFor(() => {
      const firstUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(firstUrl).toContain("/activities?");
      expect(firstUrl).toContain("dueFrom=");
      expect(firstUrl).toContain("dueTo=");
      expect(firstUrl).toContain("sortBy=dueAt");
      expect(firstUrl).toContain("sortOrder=asc");
    });

    fireEvent.change(screen.getByLabelText("Tipo"), {
      target: { value: "TASK" },
    });

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(call => String(call[0]));
      expect(urls.some(url => url.includes("type=TASK"))).toBe(true);
    });
  });
});

it("exports only the loaded agenda page as safe CSV without another request", async () => {
  const blobs: Blob[] = [];
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL(blob: Blob) {
        blobs.push(blob);
        return "blob:agenda";
      }
      static revokeObjectURL() {}
    }
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const fetchMock = vi.fn(async (input: string | URL) =>
    response({
      ...agendaPayload,
      total: 101,
      items: [
        {
          ...agendaPayload.items[0],
          title: String(input).includes("page=2")
            ? "=SUM(1,2)"
            : "Primeira página",
        },
      ],
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<AgendaView accessToken="synthetic-token" ownerUserId="owner" />);
  await screen.findByText("Primeira página");
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  await screen.findByText("=SUM(1,2)");
  const before = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Exportar agenda CSV" }));
  expect(blobs).toHaveLength(1);
  const csv = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blobs[0]!);
  });
  expect(csv).toContain('"Título","Tipo","Status","Prioridade","Prazo"');
  expect(csv).toContain(
    '"\'=SUM(1,2)","Tarefa","Pendente","Alta","2026-09-14T13:00:00.000Z"'
  );
  expect(csv).not.toContain("Primeira página");
  expect(csv).not.toContain("synthetic-token");
  expect(fetchMock).toHaveBeenCalledTimes(before);
  expect(
    screen.getByRole("button", { name: "Exportar agenda ICS" })
  ).toBeEnabled();
  click.mockRestore();
});

it("disables agenda CSV while loading and when the result is empty", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response({ items: [], page: 1, limit: 100, total: 0 }))
  );
  render(<AgendaView accessToken="token" ownerUserId="owner" />);
  const button = screen.getByRole("button", { name: "Exportar agenda CSV" });
  expect(button).toBeDisabled();
  await screen.findByText(/Nenhuma/);
  expect(button).toBeDisabled();
});
