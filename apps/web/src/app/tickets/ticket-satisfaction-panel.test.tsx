import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
const TOKEN = "A".repeat(43);

const survey = {
  id: "00000000-0000-4000-8000-0000000000bb",
  ticketId: TICKET_ID,
  state: "PENDING",
  expiresAt: "2026-10-03T12:00:00.000Z",
  rating: null,
  comment: null,
  respondedAt: null,
  createdAt: "2026-09-26T12:00:00.000Z",
  version: 1,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C5.4 ticket satisfaction panel", () => {
  it("explains that the survey starts on resolution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ survey: null }))
    );
    render(
      <TicketSatisfactionPanel
        accessToken="token"
        ticketId={TICKET_ID}
        ticketStatus="OPEN"
        canWrite
        freshLink={null}
      />
    );
    expect(
      await screen.findByText(
        "A pesquisa é criada quando a solicitação é resolvida."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Gerar link" })
    ).not.toBeInTheDocument();
  });

  it("shows the link returned by the resolution once", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ survey })));
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
    expect(screen.getByLabelText("Link para o cliente")).toHaveValue(
      `http://127.0.0.1:3000/avaliacao/${TOKEN}`
    );
  });

  it("generates a new link with the survey version and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ survey }))
      .mockResolvedValueOnce(
        response(
          {
            survey: { ...survey, version: 2 },
            link: {
              url: `http://127.0.0.1:3000/avaliacao/${TOKEN}`,
              expiresAt: survey.expiresAt,
            },
          },
          201
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TicketSatisfactionPanel
        accessToken="token"
        ticketId={TICKET_ID}
        ticketStatus="RESOLVED"
        canWrite
        freshLink={null}
      />
    );
    expect(screen.queryByLabelText("Link para o cliente")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Gerar link" }));

    const input = await screen.findByLabelText("Link para o cliente");
    expect(input).toHaveValue(`http://127.0.0.1:3000/avaliacao/${TOKEN}`);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain(`/tickets/${TICKET_ID}/satisfaction/link`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ version: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `http://127.0.0.1:3000/avaliacao/${TOKEN}`
      )
    );
    expect(
      await screen.findByRole("button", { name: "Copiado" })
    ).toBeInTheDocument();
  });

  it("shows the customer rating and hides generation when answered or read-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          survey: {
            ...survey,
            state: "RESPONDED",
            rating: 5,
            comment: "Excelente",
            respondedAt: "2026-09-27T12:00:00.000Z",
            version: 2,
          },
        })
      )
    );
    const { rerender } = render(
      <TicketSatisfactionPanel
        accessToken="token"
        ticketId={TICKET_ID}
        ticketStatus="CLOSED"
        canWrite
        freshLink={null}
      />
    );
    expect(await screen.findByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("Excelente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar link" })).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ survey })));
    rerender(
      <TicketSatisfactionPanel
        accessToken="token"
        ticketId={TICKET_ID}
        ticketStatus="RESOLVED"
        canWrite={false}
        freshLink={null}
      />
    );
    expect(await screen.findByText("Aguardando resposta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar link" })).toBeNull();
  });
});
