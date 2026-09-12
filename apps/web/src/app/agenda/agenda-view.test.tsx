import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.unstubAllGlobals();
});

describe("C4.1 AgendaView", () => {
  it("loads a weekly window and applies activity filters", async () => {
    const fetchMock = vi.fn(async () => response(agendaPayload));
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
