import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TicketSatisfactionPanel } from "./ticket-satisfaction-panel";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const TICKET_ID = "00000000-0000-4000-8000-0000000000aa";
const TOKEN = "B".repeat(43);

const survey = {
  id: "00000000-0000-4000-8000-0000000000bb",
  ticketId: TICKET_ID,
  state: "PENDING",
  expiresAt: "2026-10-08T12:00:00.000Z",
  rating: null,
  comment: null,
  respondedAt: null,
  createdAt: "2026-10-07T12:00:00.000Z",
  version: 1,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C5.4 satisfaction manual refresh safety", () => {
  it("hides the stale customer link while a manual refresh is unresolved", async () => {
    let rejectRefresh: ((reason?: unknown) => void) | undefined;
    const pendingRefresh = new Promise<Response>((_resolve, reject) => {
      rejectRefresh = reject;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ survey }))
      .mockReturnValueOnce(pendingRefresh);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TicketSatisfactionPanel
        accessToken="token"
        ticketId={TICKET_ID}
        ticketStatus="RESOLVED"
        canWrite
        freshLink={{
          url: `http://127.0.0.1:3000/avaliacao/${TOKEN}`,
          expiresAt: survey.expiresAt,
        }}
      />
    );

    expect(await screen.findByText("Aguardando resposta")).toBeInTheDocument();
    expect(screen.getByLabelText("Link para o cliente")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Atualizar pesquisa" }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Link para o cliente")).toBeNull()
    );

    rejectRefresh?.(new Error("Falha de rede"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha de rede");
    expect(screen.queryByLabelText("Link para o cliente")).toBeNull();
  });
});
