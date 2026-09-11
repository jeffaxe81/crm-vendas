import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpportunitiesView } from "./opportunities-view";

const accessToken = "opportunities-access-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const pipelineId = "22222222-2222-4222-8222-222222222222";
const stageId = "33333333-3333-4333-8333-333333333333";
const companyId = "44444444-4444-4444-8444-444444444444";

const WritableOpportunitiesView = OpportunitiesView as unknown as ComponentType<{
  accessToken: string;
  ownerUserId: string;
  canWrite: boolean;
}>;

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C3.6.5 opportunity creation", () => {
  it("creates a self-owned opportunity and refreshes the list", async () => {
    const createdOpportunity = {
      id: "55555555-5555-4555-8555-555555555555",
      organizationId: "66666666-6666-4666-8666-666666666666",
      pipelineId,
      stageId,
      companyId,
      contactId: null,
      ownerUserId,
      title: "Renovação contrato 2027",
      estimatedValue: "12500.50",
      expectedCloseAt: "2026-10-15T12:00:00.000Z",
      notes: "Cliente solicitou proposta comercial.",
      version: 1,
      createdBy: ownerUserId,
      updatedBy: ownerUserId,
      deletedAt: null,
      deletedBy: null,
      createdAt: "2026-09-11T12:00:00.000Z",
      updatedAt: "2026-09-11T12:00:00.000Z",
    };
    let opportunityReads = 0;

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/opportunities?") && !init?.method) {
        opportunityReads += 1;
        return response(
          opportunityReads === 1
            ? { items: [], page: 1, limit: 20, total: 0 }
            : { items: [createdOpportunity], page: 1, limit: 20, total: 1 }
        );
      }

      if (url.endsWith("/pipelines")) {
        return response([
          {
            id: pipelineId,
            name: "Funil de Vendas",
            stages: [
              {
                id: stageId,
                name: "Prospecção",
                position: 1,
                kind: "OPEN",
              },
            ],
          },
        ]);
      }

      if (url.includes("/companies?page=1&limit=100")) {
        return response({
          items: [
            {
              id: companyId,
              legalName: "Cliente Exemplo Ltda",
              tradeName: "Cliente Exemplo",
            },
          ],
          page: 1,
          limit: 100,
          total: 1,
        });
      }

      if (url.includes("/contacts?page=1&limit=100")) {
        return response({ items: [], page: 1, limit: 100, total: 0 });
      }

      if (url.endsWith("/opportunities") && init?.method === "POST") {
        return response(createdOpportunity);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WritableOpportunitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await screen.findByText("Nenhuma oportunidade encontrada.");
    fireEvent.click(screen.getByRole("button", { name: "Nova oportunidade" }));

    expect(
      await screen.findByRole("form", { name: "Nova oportunidade" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Renovação contrato 2027" },
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
      target: { value: "12500.50" },
    });
    fireEvent.change(screen.getByLabelText("Previsão de fechamento"), {
      target: { value: "2026-10-15T09:00" },
    });
    fireEvent.change(screen.getByLabelText("Observações"), {
      target: { value: "Cliente solicitou proposta comercial." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar oportunidade" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/opportunities") && init?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const payload = JSON.parse(String(postCall?.[1]?.body));
      expect(payload).toEqual({
        pipelineId,
        stageId,
        companyId,
        ownerUserId,
        title: "Renovação contrato 2027",
        estimatedValue: "12500.50",
        expectedCloseAt: new Date("2026-10-15T09:00").toISOString(),
        notes: "Cliente solicitou proposta comercial.",
      });
    });

    expect(await screen.findByText("Renovação contrato 2027")).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Nova oportunidade" })
    ).not.toBeInTheDocument();
  });
});
