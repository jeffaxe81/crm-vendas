import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpportunitiesView } from "./opportunities-view";

const accessToken = "opportunities-access-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const pipelineId = "22222222-2222-4222-8222-222222222222";
const prospectingStageId = "33333333-3333-4333-8333-333333333333";
const proposalStageId = "44444444-4444-4444-8444-444444444444";
const companyId = "55555555-5555-4555-8555-555555555555";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function opportunityRecord(input: {
  id: string;
  title: string;
  stageId: string;
  estimatedValue: string;
}) {
  return {
    id: input.id,
    organizationId: "66666666-6666-4666-8666-666666666666",
    pipelineId,
    stageId: input.stageId,
    companyId,
    contactId: null,
    ownerUserId,
    title: input.title,
    estimatedValue: input.estimatedValue,
    expectedCloseAt: null,
    notes: null,
    version: 1,
    createdBy: ownerUserId,
    updatedBy: ownerUserId,
    deletedAt: null,
    deletedBy: null,
    createdAt: "2026-10-04T12:00:00.000Z",
    updatedAt: "2026-10-04T12:00:00.000Z",
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C3.6.7 opportunities sales funnel", () => {
  it("renders opportunities in ordered pipeline stage columns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url.includes("/opportunities?")) {
          return response({
            items: [
              opportunityRecord({
                id: "77777777-7777-4777-8777-777777777777",
                title: "Renovação anual",
                stageId: prospectingStageId,
                estimatedValue: "1500.00",
              }),
              opportunityRecord({
                id: "88888888-8888-4888-8888-888888888888",
                title: "Expansão de contrato",
                stageId: proposalStageId,
                estimatedValue: "4200.00",
              }),
            ],
            page: 1,
            limit: 20,
            total: 2,
          });
        }

        if (url.endsWith("/pipelines")) {
          return response([
            {
              id: pipelineId,
              name: "Funil de Vendas",
              stages: [
                {
                  id: proposalStageId,
                  name: "Proposta",
                  position: 2,
                },
                {
                  id: prospectingStageId,
                  name: "Prospecção",
                  position: 1,
                },
              ],
            },
          ]);
        }

        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    render(
      <OpportunitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite={false}
        canMove
      />
    );

    await screen.findByText("Renovação anual");

    fireEvent.click(screen.getByRole("button", { name: "Funil" }));

    const board = await screen.findByRole("region", {
      name: "Funil de vendas",
    });
    const columns = within(board).getAllByRole("region");
    const [prospectingColumn, proposalColumn] = columns;

    expect(columns).toHaveLength(2);
    if (!prospectingColumn || !proposalColumn) {
      throw new Error("Expected two pipeline stage columns.");
    }

    expect(
      within(prospectingColumn).getByRole("heading", { name: "Prospecção" })
    ).toBeInTheDocument();
    expect(
      within(prospectingColumn).getByText("Renovação anual")
    ).toBeInTheDocument();
    expect(
      within(proposalColumn).getByRole("heading", { name: "Proposta" })
    ).toBeInTheDocument();
    expect(
      within(proposalColumn).getByText("Expansão de contrato")
    ).toBeInTheDocument();
  });
});
