import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgendaView } from "./agenda-view";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4 ACT-003 follow-up na agenda", () => {
  it("filtra follow-ups atrasados na agenda", async () => {
    const fetchMock = vi.fn(async (_input: string | URL) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              title: "Retornar proposta vencida",
              type: "FOLLOW_UP",
              status: "PENDING",
              priority: "HIGH",
              dueAt: "2000-01-01T12:00:00.000Z",
            },
          ],
          page: 1,
          limit: 100,
          total: 1,
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AgendaView
        accessToken="test-token"
        ownerUserId="11111111-1111-4111-8111-111111111111"
        initialFocus="OVERDUE"
      />
    );
    expect(
      await screen.findByText("Retornar proposta vencida")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Follow-up", { selector: "span" })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo"), {
      target: { value: "FOLLOW_UP" },
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => {
          const params = new URL(String(url)).searchParams;
          return (
            params.get("type") === "FOLLOW_UP" &&
            params.get("status") === "PENDING" &&
            params.has("dueTo") &&
            !params.has("dueFrom")
          );
        })
      ).toBe(true);
    });
  });
});
