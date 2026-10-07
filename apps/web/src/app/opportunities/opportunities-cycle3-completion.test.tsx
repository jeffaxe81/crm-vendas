import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpportunitiesView } from "./opportunities-view";

const accessToken = "cycle3-completion-access-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const pipelineId = "22222222-2222-4222-8222-222222222222";
const openStageId = "33333333-3333-4333-8333-333333333333";
const lostStageId = "44444444-4444-4444-8444-444444444444";
const companyId = "55555555-5555-4555-8555-555555555555";
const opportunityId = "77777777-7777-4777-8777-777777777777";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function opportunityRecord(
  input: Partial<{
    title: string;
    stageId: string;
    notes: string | null;
    version: number;
  }> = {}
) {
  return {
    id: opportunityId,
    organizationId: "66666666-6666-4666-8666-666666666666",
    pipelineId,
    stageId: input.stageId ?? openStageId,
    companyId,
    contactId: null,
    ownerUserId,
    title: input.title ?? "Contrato aberto",
    estimatedValue: "1500.00",
    expectedCloseAt: null,
    notes: input.notes ?? null,
    version: input.version ?? 1,
    createdBy: ownerUserId,
    updatedBy: ownerUserId,
    deletedAt: null,
    deletedBy: null,
    createdAt: "2026-10-04T12:00:00.000Z",
    updatedAt: "2026-10-04T12:00:00.000Z",
  };
}

function pipelineResponse() {
  return [
    {
      id: pipelineId,
      name: "Funil de Vendas",
      stages: [
        {
          id: openStageId,
          name: "Prospecção",
          position: 1,
          kind: "OPEN",
        },
        {
          id: lostStageId,
          name: "Perdida",
          position: 2,
          kind: "LOST",
        },
      ],
    },
  ];
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Cycle 3 opportunities app completion", () => {
  it("shows terminal status and details without allowing a lost opportunity to reopen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url.includes("/opportunities?")) {
          return response({
            items: [
              opportunityRecord({
                title: "Contrato encerrado",
                stageId: lostStageId,
                notes: "Cliente optou por outro fornecedor.",
              }),
            ],
            page: 1,
            limit: 20,
            total: 1,
          });
        }

        if (url.endsWith("/pipelines")) {
          return response(pipelineResponse());
        }

        if (url.includes("/companies?")) {
          return response({
            items: [
              {
                id: companyId,
                legalName: "Cliente Exemplo S.A.",
                tradeName: "Cliente Exemplo",
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

        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    render(
      <OpportunitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
        canMove
      />
    );

    await screen.findByText("Contrato encerrado");
    expect(screen.getByText("Perdida")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mover etapa" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver detalhes" }));

    const details = await screen.findByRole("region", {
      name: "Detalhes de Contrato encerrado",
    });
    expect(within(details).getByText("Cliente Exemplo")).toBeInTheDocument();
    expect(
      within(details).getByText("Cliente optou por outro fornecedor.")
    ).toBeInTheDocument();
  });

  it("edits mutable opportunity fields using the current optimistic version", async () => {
    let patchBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/opportunities?")) {
          return response({
            items: [opportunityRecord()],
            page: 1,
            limit: 20,
            total: 1,
          });
        }

        if (url.endsWith("/pipelines")) {
          return response(pipelineResponse());
        }

        if (url.includes("/companies?")) {
          return response({
            items: [
              {
                id: companyId,
                legalName: "Cliente Exemplo S.A.",
                tradeName: "Cliente Exemplo",
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

        if (
          url.endsWith(`/opportunities/${opportunityId}`) &&
          init?.method === "PATCH"
        ) {
          patchBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          return response(
            opportunityRecord({
              title: "Contrato editado",
              version: 2,
            })
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    render(
      <OpportunitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
        canMove
      />
    );

    await screen.findByText("Contrato aberto");
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    const form = await screen.findByRole("form", {
      name: "Editar Contrato aberto",
    });
    fireEvent.change(within(form).getByLabelText("Título"), {
      target: { value: "Contrato editado" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Salvar alterações" })
    );

    await waitFor(() => {
      expect(patchBody).toMatchObject({
        title: "Contrato editado",
        version: 1,
      });
    });
    expect(patchBody).not.toHaveProperty("estimatedValue");
    expect(await screen.findByText("Contrato editado")).toBeInTheDocument();
  });
});
