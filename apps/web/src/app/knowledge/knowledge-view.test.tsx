import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KnowledgeView } from "./knowledge-view";

const token = "knowledge-web-token";
const emptyPage = { items: [], page: 1, limit: 20, total: 0 };
const record = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "NOTE",
  title: "Anotação comercial",
  category: "Comercial",
  source: "CRM",
  accessLevel: "ORGANIZATION",
  noteContent: "Cliente quer proposta",
  url: null,
  originalFileName: null,
  sizeBytes: null,
  aiStatus: "UNPROCESSED",
  companyIds: [],
  contactIds: [],
  opportunityIds: [],
  createdAt: "2026-11-03T10:00:00.000Z",
  version: 1,
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Cycle 5 Knowledge Hub Web", () => {
  it("keeps VIEWER read-only while showing scoped knowledge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({ ...emptyPage, items: [record], total: 1 })
      )
    );
    render(<KnowledgeView accessToken={token} canWrite={false} />);
    expect(await screen.findByText(record.title)).toBeInTheDocument();
    expect(screen.getByText(record.noteContent)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novo registro" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir" })).toBeNull();
  });

  it("submits a note to the authenticated API and reloads results", async () => {
    let created = false;
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          type: string;
          title: string;
          noteContent: string;
        };
        expect(body).toMatchObject({
          type: "NOTE",
          title: "Registro da visita",
          noteContent: "Cliente apresentou nova demanda.",
        });
        expect(init.headers).toEqual(
          expect.objectContaining({ Authorization: "Bearer " + token })
        );
        created = true;
        return response(record, 201);
      }
      return response(
        created ? { ...emptyPage, items: [record], total: 1 } : emptyPage
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<KnowledgeView accessToken={token} canWrite />);

    await screen.findByText("Nenhum registro encontrado.");
    fireEvent.click(screen.getByRole("button", { name: "Novo registro" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "Registro da visita" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Conteúdo da nota" }),
      { target: { value: "Cliente apresentou nova demanda." } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(record.title)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      true
    );
  });

  it("sends search and type filters to the server", async () => {
    const fetchMock = vi.fn(async () => response(emptyPage));
    vi.stubGlobal("fetch", fetchMock);
    render(<KnowledgeView accessToken={token} canWrite={false} />);
    await screen.findByText("Nenhum registro encontrado.");
    fireEvent.change(screen.getByRole("textbox", { name: "Pesquisar" }), {
      target: { value: "Contrato" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo" }), {
      target: { value: "DOCUMENT" },
    });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls.some(url => url.includes("q=Contrato"))).toBe(true);
      expect(urls.some(url => url.includes("type=DOCUMENT"))).toBe(true);
    });
  });
});
