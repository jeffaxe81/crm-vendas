import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PipelineAnalyticsView } from "./pipeline-analytics-view";

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Ciclo 6: contexto da saúde comercial", () => {
  it("descarta o funil anterior ao mudar a organização autenticada", async () => {
    const calls: Array<{
      path: string;
      token: string;
      pipelineId: string | null;
    }> = [];
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input));
      const token = new Headers(init?.headers).get("Authorization") ?? "";
      const pipelineId = url.searchParams.get("pipelineId");
      calls.push({ path: url.pathname, token, pipelineId });
      if (url.pathname.endsWith("/pipelines")) {
        return response([
          {
            id: token === "Bearer tenant-a" ? "funil-a" : "funil-b",
            name:
              token === "Bearer tenant-a"
                ? "Funil da empresa A"
                : "Funil da empresa B",
          },
        ]);
      }
      if (url.pathname.endsWith("/reports/pipeline-health")) {
        return response({
          totalOpenOpportunities: 0,
          openValue: "0",
          winRate: null,
          stageConcentration: {
            stageName: null,
            percentage: 0,
            exceeded: false,
          },
        });
      }
      if (url.pathname.endsWith("/reports/opportunity-aging")) {
        return response({ stages: [] });
      }
      if (url.pathname.endsWith("/reports/commercial-risks")) {
        return response({ risks: [], evaluated: 0, truncated: false });
      }
      throw new Error("Rota inesperada: " + url.pathname);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<PipelineAnalyticsView accessToken="tenant-a" />);
    await waitFor(() =>
      expect(
        calls.some(
          call =>
            call.path.endsWith("/reports/pipeline-health") &&
            call.pipelineId === "funil-a"
        )
      ).toBe(true)
    );

    view.rerender(<PipelineAnalyticsView accessToken="tenant-b" />);
    expect(screen.queryByText("Funil da empresa A")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        calls.some(
          call =>
            call.path.endsWith("/reports/pipeline-health") &&
            call.pipelineId === "funil-b"
        )
      ).toBe(true)
    );
    expect(
      calls.filter(
        call =>
          call.token === "Bearer tenant-b" &&
          call.path.includes("/reports/") &&
          call.pipelineId === "funil-a"
      )
    ).toHaveLength(0);
    expect(screen.getByRole("combobox")).toHaveValue("funil-b");
    expect(screen.getByText("Funil da empresa B")).toBeVisible();
  });

  it("não consulta relatórios quando a nova organização não tem funis", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(String(input));
        calls.push(url.pathname);
        return response([]);
      })
    );

    render(<PipelineAnalyticsView accessToken="sem-funis" />);
    expect(await screen.findByText("Nenhum funil disponível.")).toBeVisible();
    expect(calls.filter(path => path.includes("/reports/"))).toHaveLength(0);
  });
  it("remove métricas e opções antigas ao trocar para uma organização sem funis", async () => {
    const calls: Array<{ token: string; path: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(String(input));
        const token = new Headers(init?.headers).get("Authorization") ?? "";
        calls.push({ token, path: url.pathname });
        if (url.pathname.endsWith("/pipelines")) {
          return response(
            token === "Bearer tenant-a"
              ? [{ id: "funil-a", name: "Funil confidencial A" }]
              : []
          );
        }
        if (url.pathname.endsWith("/reports/pipeline-health")) {
          return response({
            totalOpenOpportunities: 42,
            openValue: "0",
            winRate: null,
            stageConcentration: {
              stageName: null,
              percentage: 0,
              exceeded: false,
            },
          });
        }
        if (url.pathname.endsWith("/reports/opportunity-aging")) {
          return response({ stages: [] });
        }
        if (url.pathname.endsWith("/reports/commercial-risks")) {
          return response({ risks: [], evaluated: 0, truncated: false });
        }
        throw new Error("Rota inesperada: " + url.pathname);
      })
    );
    const view = render(<PipelineAnalyticsView accessToken="tenant-a" />);
    expect(await screen.findByText("Funil confidencial A")).toBeVisible();
    expect(await screen.findByText("42")).toBeVisible();

    view.rerender(<PipelineAnalyticsView accessToken="tenant-sem-funis" />);
    expect(screen.queryByText("Funil confidencial A")).not.toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    expect(await screen.findByText("Nenhum funil disponível.")).toBeVisible();
    expect(
      calls.filter(
        call =>
          call.token === "Bearer tenant-sem-funis" &&
          call.path.includes("/reports/")
      )
    ).toHaveLength(0);
  });

});
