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

const accessToken = "opportunities-access-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const pipelineId = "22222222-2222-4222-8222-222222222222";
const initialStageId = "33333333-3333-4333-8333-333333333333";
const targetStageId = "44444444-4444-4444-8444-444444444444";
const opportunityId = "55555555-5555-4555-8555-555555555555";
const companyId = "66666666-6666-4666-8666-666666666666";
const opportunityTitle = "Renovação anual";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function opportunityRecord(stageId: string, version: number) {
  return {
    id: opportunityId,
    organizationId: "77777777-7777-4777-8777-777777777777",
    pipelineId,
    stageId,
    companyId,
    contactId: null,
    ownerUserId,
    title: opportunityTitle,
    estimatedValue: "1500.00",
    expectedCloseAt: null,
    notes: null,
    version,
    createdBy: ownerUserId,
    updatedBy: ownerUserId,
    deletedAt: null,
    deletedBy: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
  };
}

function stubApi() {
  let opportunityReads = 0;
  let moved = false;

  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.includes("/opportunities?")) {
      opportunityReads += 1;
      return response({
        items: [
          opportunityRecord(moved ? targetStageId : initialStageId, moved ? 4 : 3),
        ],
        page: 1,
        limit: 20,
        total: 1,
      });
    }

    if (url.endsWith("/pipelines")) {
      return response([
        {
          id: pipelineId,
          name: "Funil de Vendas",
          stages: [
            { id: initialStageId, name: "Prospecção", position: 1 },
            { id: targetStageId, name: "Proposta", position: 2 },
          ],
        },
      ]);
    }

    if (
      url.endsWith(`/opportunities/${opportunityId}/stage`) &&
      init?.method === "PATCH"
    ) {
      moved = true;
      return response(opportunityRecord(targetStageId, 4));
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  return { fetchMock, getOpportunityReads: () => opportunityReads };
}

function props(canMove: boolean) {
  return {
    accessToken,
    ownerUserId,
    canWrite: true,
    canMove,
  } as Parameters<typeof OpportunitiesView>[0];
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C3.6.6 opportunity stage movement", () => {
  it("hides stage movement without opportunity.move", async () => {
    stubApi();

    render(<OpportunitiesView {...props(false)} />);

    const card = await screen.findByRole("listitem");
    expect(
      within(card).queryByRole("combobox", {
        name: `Etapa de ${opportunityTitle}`,
      })
    ).toBeNull();
  });

  it("moves an opportunity within its pipeline and reloads the list", async () => {
    const { fetchMock, getOpportunityReads } = stubApi();

    render(<OpportunitiesView {...props(true)} />);

    const stageSelect = await screen.findByRole("combobox", {
      name: `Etapa de ${opportunityTitle}`,
    });
    fireEvent.change(stageSelect, { target: { value: targetStageId } });
    fireEvent.click(screen.getByRole("button", { name: "Mover etapa" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(`/opportunities/${opportunityId}/stage`) &&
          init?.method === "PATCH"
      );

      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        stageId: targetStageId,
        version: 3,
      });
      expect(getOpportunityReads()).toBeGreaterThanOrEqual(2);
    });

    expect(
      screen.getByRole<HTMLSelectElement>("combobox", {
        name: `Etapa de ${opportunityTitle}`,
      }).value
    ).toBe(targetStageId);
  });
});
