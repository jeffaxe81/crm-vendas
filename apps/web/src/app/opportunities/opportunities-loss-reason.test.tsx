import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpportunitiesView } from "./opportunities-view";

const accessToken = "loss-reason-access-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const pipelineId = "22222222-2222-4222-8222-222222222222";
const openStageId = "33333333-3333-4333-8333-333333333333";
const lostStageId = "44444444-4444-4444-8444-444444444444";
const opportunityId = "55555555-5555-4555-8555-555555555555";
const companyId = "66666666-6666-4666-8666-666666666666";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
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

function opportunityRecord(stageId = openStageId, version = 3) {
  return {
    id: opportunityId,
    organizationId: "77777777-7777-4777-8777-777777777777",
    pipelineId,
    stageId,
    companyId,
    contactId: null,
    ownerUserId,
    title: "Renovação anual",
    estimatedValue: "1500.00",
    expectedCloseAt: null,
    notes: null,
    lossReason: stageId === lostStageId ? "Cliente sem orçamento" : null,
    version,
    createdBy: ownerUserId,
    updatedBy: ownerUserId,
    deletedAt: null,
    deletedBy: null,
    createdAt: "2026-11-01T20:00:00.000Z",
    updatedAt: "2026-11-01T20:00:00.000Z",
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C3 loss reason web completion", () => {
  it("requires and sends a loss reason when moving to LOST", async () => {
    let moved = false;

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/opportunities?")) {
        return response({
          items: [
            opportunityRecord(moved ? lostStageId : openStageId, moved ? 4 : 3),
          ],
          page: 1,
          limit: 20,
          total: 1,
        });
      }

      if (url.endsWith("/pipelines")) {
        return response(pipelineResponse());
      }

      if (
        url.endsWith(`/opportunities/${opportunityId}/stage`) &&
        init?.method === "PATCH"
      ) {
        moved = true;
        return response(opportunityRecord(lostStageId, 4));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OpportunitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
        canMove
      />
    );

    const stageSelect = await screen.findByRole("combobox", {
      name: "Etapa de Renovação anual",
    });
    fireEvent.change(stageSelect, { target: { value: lostStageId } });
    fireEvent.click(screen.getByRole("button", { name: "Mover etapa" }));

    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith(`/opportunities/${opportunityId}/stage`) &&
          init?.method === "PATCH"
      )
    ).toBe(false);

    const reason = await screen.findByLabelText("Motivo da perda");
    fireEvent.change(reason, {
      target: { value: "  Cliente sem orçamento  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar perda" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(`/opportunities/${opportunityId}/stage`) &&
          init?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        stageId: lostStageId,
        version: 3,
        lossReason: "Cliente sem orçamento",
      });
    });
  });

  it("requires and sends a loss reason when creating directly in LOST", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/opportunities?")) {
        return response({ items: [], page: 1, limit: 20, total: 0 });
      }

      if (url.endsWith("/pipelines")) {
        return response(pipelineResponse());
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

      if (url.endsWith("/opportunities") && init?.method === "POST") {
        return response(opportunityRecord(lostStageId, 1), 201);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OpportunitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
        canMove
      />
    );

    await screen.findByText("Nenhuma oportunidade encontrada.");
    fireEvent.click(screen.getByRole("button", { name: "Nova oportunidade" }));

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Nova perda" },
    });
    fireEvent.change(screen.getByLabelText("Cliente"), {
      target: { value: `company:${companyId}` },
    });
    fireEvent.change(screen.getByLabelText("Funil"), {
      target: { value: pipelineId },
    });
    fireEvent.change(screen.getByLabelText("Etapa"), {
      target: { value: lostStageId },
    });
    fireEvent.change(screen.getByLabelText("Valor estimado"), {
      target: { value: "900.00" },
    });

    const reason = await screen.findByLabelText("Motivo da perda");
    fireEvent.change(reason, {
      target: { value: "Sem aderência comercial" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Nova oportunidade" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/opportunities") && init?.method === "POST"
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
        pipelineId,
        stageId: lostStageId,
        companyId,
        ownerUserId,
        title: "Nova perda",
        estimatedValue: "900.00",
        lossReason: "Sem aderência comercial",
      });
    });
  });
});
