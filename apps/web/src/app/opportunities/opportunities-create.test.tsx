import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpportunitiesView } from "./opportunities-view";

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function stubApi() {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url.includes("/opportunities?")) {
      return response({ items: [], page: 1, limit: 20, total: 0 });
    }
    if (url.endsWith("/pipelines")) {
      return response([]);
    }
    if (url.includes("/companies?")) {
      return response({ items: [], page: 1, limit: 100, total: 0 });
    }
    if (url.includes("/contacts?")) {
      return response({ items: [], page: 1, limit: 100, total: 0 });
    }

    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C3.6.5 opportunity creation", () => {
  it("shows the create action", async () => {
    stubApi();

    render(<OpportunitiesView accessToken="opportunities-access-token" />);

    await screen.findByText("Nenhuma oportunidade encontrada.");

    expect(
      screen.getByRole("button", { name: "Nova oportunidade" })
    ).toBeInTheDocument();
  });

  it("opens the opportunity form", async () => {
    stubApi();

    render(<OpportunitiesView accessToken="opportunities-access-token" />);

    await screen.findByText("Nenhuma oportunidade encontrada.");
    fireEvent.click(screen.getByRole("button", { name: "Nova oportunidade" }));

    expect(
      await screen.findByRole("form", { name: "Nova oportunidade" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toBeInTheDocument();
    expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
    expect(screen.getByLabelText("Funil")).toBeInTheDocument();
    expect(screen.getByLabelText("Etapa")).toBeInTheDocument();
    expect(screen.getByLabelText("Valor estimado")).toBeInTheDocument();
    expect(screen.getByLabelText("Previsão de fechamento")).toBeInTheDocument();
    expect(screen.getByLabelText("Observações")).toBeInTheDocument();
  });
});
