import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TerritoryDetailPanel } from "./territory-detail-panel";

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

describe("C4.1.6 territory detail usability", () => {
  it("searches and selects a company by name before adding coverage", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);

        if (url.includes("/territories/t-1/coverage/add")) {
          return response(
            {
              id: "target-1",
              companyId: "11111111-1111-4111-8111-111111111111",
              coverageStatus: "UNCOVERED",
            },
            201
          );
        }
        if (url.includes("/territories/t-1/metrics")) {
          return response({
            coveragePercentage: "0.00",
            quotaPercentage: "0.00",
            actualRevenue: "0.00",
            targetCount: 0,
            coveredCount: 0,
          });
        }
        if (url.includes("/territories/t-1/coverage")) {
          return response([]);
        }
        if (url.includes("/territories/t-1/quotas")) {
          return response([]);
        }
        if (url.includes("/companies?")) {
          return response({
            items: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                legalName: "Empresa Exemplo S.A.",
                tradeName: "Empresa Exemplo",
              },
            ],
            page: 1,
            limit: 50,
            total: 1,
          });
        }

        throw new Error(
          `Unexpected request: ${url} ${String(init?.method ?? "GET")}`
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TerritoryDetailPanel
        accessToken="token"
        territoryId="t-1"
        canWrite
      />
    );

    await screen.findByText("Nenhuma empresa-alvo cadastrada.");

    fireEvent.change(screen.getByLabelText("Buscar empresa"), {
      target: { value: "Empresa Exemplo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    await screen.findByRole("option", {
      name: "Empresa Exemplo — Empresa Exemplo S.A.",
    });
    fireEvent.change(screen.getByLabelText("Empresa-alvo"), {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => {
      const addCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/territories/t-1/coverage/add")
      );
      expect(addCall).toBeDefined();
      const [, init] = addCall as [string | URL, RequestInit];
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        companyId: "11111111-1111-4111-8111-111111111111",
      });
    });
  });
});
