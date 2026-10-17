import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardVolumeView } from "./dashboard-volume-view";

const catalog = {
  version: 1,
  metrics: [
    { id: "crm.companies.active", label: "Empresas ativas", unit: "records", permission: "reports.read" },
    { id: "crm.contacts.active", label: "Contatos ativos", unit: "records", permission: "reports.read" },
    { id: "crm.opportunities.active", label: "Oportunidades ativas", unit: "records", permission: "reports.read" },
    { id: "crm.activities.active", label: "Atividades ativas", unit: "records", permission: "reports.read" },
  ],
};
const volume = {
  asOf: "2026-10-17T14:00:00.000Z",
  counts: { companies: 3, contacts: 2, opportunities: 1, activities: 4 },
  totalActiveRecords: 10,
  thresholds: { warning: 800, critical: 1000 },
  level: "normal",
  queryDurationMs: 3,
};
function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
function stubRequests(nextVolume: unknown = volume) {
  const fn = vi.fn(async (url: string) =>
    response(url.endsWith("/dashboards/catalog") ? catalog : nextVolume)
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Tenant dashboard volume", () => {
  it("renders a validated four-metric snapshot without exposing records", async () => {
    const fetchMock = stubRequests();
    render(<DashboardVolumeView accessToken="tenant-a" />);
    expect(await screen.findByText("Empresas ativas")).toBeInTheDocument();
    expect(screen.getByText("Contatos ativos")).toBeInTheDocument();
    expect(screen.getByText("Oportunidades ativas")).toBeInTheDocument();
    expect(screen.getByText("Atividades ativas")).toBeInTheDocument();
    expect(screen.getByText("Total de registros ativos: ").parentElement).toHaveTextContent("10");
    expect(screen.queryByText("Atenção: volume acima do limiar de observação.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain("tenant-a");
      expect(options?.cache).toBe("no-store");
      expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer tenant-a");
    }
  });

  it("shows observational warning and critical thresholds, never a quota", async () => {
    const fetchMock = stubRequests({
      ...volume,
      counts: { companies: 800, contacts: 0, opportunities: 0, activities: 0 },
      totalActiveRecords: 800,
      level: "warning",
    });
    render(<DashboardVolumeView accessToken="tenant-a" />);
    expect(await screen.findByText("Atenção: volume acima do limiar de observação.")).toBeInTheDocument();
    expect(screen.getByText(/não bloqueiam cadastros/)).toBeInTheDocument();
    fetchMock.mockImplementation(async (url: string) =>
      response(
        url.endsWith("/dashboards/catalog")
          ? catalog
          : {
              ...volume,
              counts: { companies: 1000, contacts: 0, opportunities: 0, activities: 0 },
              totalActiveRecords: 1000,
              level: "critical",
            }
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Atualizar volume" }));
    expect(await screen.findByText("Atenção: volume acima do limiar crítico de observação.")).toBeInTheDocument();
  });

  it("clears previous snapshot on refresh failure and allows retry", async () => {
    const fetchMock = stubRequests();
    render(<DashboardVolumeView accessToken="tenant-a" />);
    await screen.findByText("Empresas ativas");
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/dashboards/catalog")
        ? response(catalog)
        : response({ message: "Falha simulada" }, 500)
    );
    fireEvent.click(screen.getByRole("button", { name: "Atualizar volume" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha simulada");
    expect(screen.queryByText("Empresas ativas")).not.toBeInTheDocument();
    fetchMock.mockImplementation(async (url: string) =>
      response(url.endsWith("/dashboards/catalog") ? catalog : volume)
    );
    fireEvent.click(screen.getByRole("button", { name: "Atualizar volume" }));
    expect(await screen.findByText("Empresas ativas")).toBeInTheDocument();
  });

  it("rejects inconsistent server totals rather than showing false counts", async () => {
    stubRequests({ ...volume, totalActiveRecords: 999 });
    render(<DashboardVolumeView accessToken="tenant-a" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("totais inconsistentes");
    expect(screen.queryByText("Empresas ativas")).not.toBeInTheDocument();
  });

  it("never displays an old tenant response after switching access tokens", async () => {
    let resolveOld: ((value: Response) => void) | undefined;
    const mock = vi.fn((url: string, options?: RequestInit) => {
      const token = new Headers(options?.headers).get("Authorization");
      if (url.endsWith("/dashboards/catalog")) return Promise.resolve(response(catalog));
      if (token === "Bearer tenant-b") {
        return Promise.resolve(
          response({
            ...volume,
            counts: { companies: 9, contacts: 0, opportunities: 0, activities: 0 },
            totalActiveRecords: 9,
          })
        );
      }
      return new Promise<Response>(resolve => {
        resolveOld = resolve;
      });
    });
    vi.stubGlobal("fetch", mock);
    const { rerender } = render(<DashboardVolumeView accessToken="tenant-a" />);
    await waitFor(() => expect(resolveOld).toBeDefined());
    rerender(<DashboardVolumeView accessToken="tenant-b" />);
    expect(await screen.findByText("9")).toBeInTheDocument();
    resolveOld?.(response({ ...volume, counts: { companies: 777, contacts: 0, opportunities: 0, activities: 0 }, totalActiveRecords: 777 }));
    await waitFor(() => expect(screen.queryByText("777")).not.toBeInTheDocument());
    expect(screen.getByText("9")).toBeInTheDocument();
  });
});
