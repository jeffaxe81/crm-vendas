import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpportunitiesView } from "./opportunities-view";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const pipelineId = "22222222-2222-4222-8222-222222222222";
const stageId = "33333333-3333-4333-8333-333333333333";
const companyId = "44444444-4444-4444-8444-444444444444";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function stubApi() {
  let opportunityReads = 0;
  const fetchMock = vi.fn(
    async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);

      if (url.includes("/opportunities?") && init?.method !== "POST") {
        opportunityReads += 1;
        return response({
          items:
            opportunityReads > 1
              ? [
                  {
                    id: "55555555-5555-4555-8555-555555555555",
                    organizationId: "66666666-6666-4666-8666-666666666666",
                    pipelineId,
                    stageId,
                    companyId,
                    contactId: null,
                    ownerUserId,
                    title: "Renovação anual",
                    estimatedValue: "1500.00",
                    expectedCloseAt: null,
                    notes: null,
                    version: 1,
                    createdBy: ownerUserId,
                    updatedBy: ownerUserId,
                    deletedAt: null,
                    deletedBy: null,
                    createdAt: "2026-09-11T09:00:00.000Z",
                    updatedAt: "2026-09-11T09:00:00.000Z",
                  },
                ]
              : [],
          page: 1,
          limit: 20,
          total: opportunityReads > 1 ? 1 : 0,
        });
      }
      if (url.endsWith("/opportunities") && init?.method === "POST") {
        return response(
          { id: "55555555-5555-4555-8555-555555555555" },
          201
        );
      }
      if (url.endsWith("/pipelines")) {
        return response([
          {
            id: pipelineId,
            name: "Funil de Vendas",
            stages: [{ id: stageId, name: "Prospecção", position: 1 }],
          },
        ]);
      }
      if (url.includes("/companies?")) {
        return response({
          items: [
            {
              id: companyId,
              legalName: "Empresa Exemplo",
              tradeName: null,
            },
          ],
          page: 1,
          limit: 100,
          total: 1,
        });
      }
      if (url.includes("/contacts?")) {
        return response({ items: [], page: 1, limit: 100, total: 0 });
      }

      throw new Error(`Unexpected request: ${url}`);
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C3.6.5 opportunity creation", () => {
  it("shows the create action for opportunity.write", async () => {
    stubApi();

    render(
      <OpportunitiesView
        accessToken="opportunities-access-token"
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await screen.findByText("Nenhuma oportunidade encontrada.");

    expect(
      screen.getByRole("button", { name: "Nova oportunidade" })
    ).toBeInTheDocument();
  });

  it("hides the create action without opportunity.write", async () => {
    stubApi();

    render(
      <OpportunitiesView
        accessToken="opportunities-access-token"
        ownerUserId={ownerUserId}
        canWrite={false}
      />
    );

    await screen.findByText("Nenhuma oportunidade encontrada.");

    expect(
      screen.queryByRole("button", { name: "Nova oportunidade" })
    ).not.toBeInTheDocument();
  });

  it("opens the opportunity form and loads tenant references", async () => {
    stubApi();

    render(
      <OpportunitiesView
        accessToken="opportunities-access-token"
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await screen.findByText("Nenhuma oportunidade encontrada.");
    fireEvent.click(
      screen.getByRole("button", { name: "Nova oportunidade" })
    );

    expect(
      await screen.findByRole("form", { name: "Nova oportunidade" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "Empresa Exemplo" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "Funil de Vendas" })
    ).toBeInTheDocument();
  });

  it("creates a self-owned opportunity and reloads the list", async () => {
    const fetchMock = stubApi();

    render(
      <OpportunitiesView
        accessToken="opportunities-access-token"
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await screen.findByText("Nenhuma oportunidade encontrada.");
    fireEvent.click(
      screen.getByRole("button", { name: "Nova oportunidade" })
    );

    fireEvent.change(await screen.findByLabelText("Título"), {
      target: { value: "Renovação anual" },
    });
    fireEvent.change(screen.getByLabelText("Cliente"), {
      target: { value: `company:${companyId}` },
    });
    fireEvent.change(screen.getByLabelText("Funil"), {
      target: { value: pipelineId },
    });
    fireEvent.change(screen.getByLabelText("Etapa"), {
      target: { value: stageId },
    });
    fireEvent.change(screen.getByLabelText("Valor estimado"), {
      target: { value: "1500.00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar oportunidade" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            pipelineId,
            stageId,
            companyId,
            ownerUserId,
            title: "Renovação anual",
            estimatedValue: "1500.00",
          }),
        })
      );
    });

    expect(await screen.findByText("Renovação anual")).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Nova oportunidade" })
    ).not.toBeInTheDocument();
  });
});
