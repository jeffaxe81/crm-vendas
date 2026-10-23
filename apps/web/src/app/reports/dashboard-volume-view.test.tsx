import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../i18n/language-provider", () => ({
  useTranslation: () => ({
    locale: "en-US",
    t: (message: string | undefined) => message ?? "",
  }),
}));

import { DashboardVolumeView } from "./dashboard-volume-view";

const catalog = {
  version: 1,
  metrics: [
    ["crm.companies.active", "Empresas ativas"],
    ["crm.contacts.active", "Contatos ativos"],
    ["crm.opportunities.active", "Oportunidades ativas"],
    ["crm.activities.active", "Atividades ativas"],
  ].map(([id, label]) => ({
    id,
    label,
    unit: "records",
    permission: "reports.read",
  })),
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
  const fn = vi.fn(async (url: string, _options?: RequestInit) =>
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
  it("renders validated tenant counts", async () => {
    const fetchMock = stubRequests();
    render(<DashboardVolumeView accessToken="tenant-a" />);
    expect(await screen.findByText("Empresas ativas")).toBeInTheDocument();
    expect(screen.getByText("Contatos ativos")).toBeInTheDocument();
    expect(screen.getByText("Oportunidades ativas")).toBeInTheDocument();
    expect(screen.getByText("Atividades ativas")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(
      screen.queryByText("Atenção: volume acima do limiar de observação.")
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain("tenant-a");
      expect(options?.cache).toBe("no-store");
      expect(new Headers(options?.headers).get("Authorization")).toBe(
        "Bearer tenant-a"
      );
    }
  });

  it("formats numbers using the active locale", async () => {
    stubRequests({
      ...volume,
      counts: {
        companies: 1000,
        contacts: 0,
        opportunities: 0,
        activities: 0,
      },
      totalActiveRecords: 1000,
      level: "critical",
    });
    render(<DashboardVolumeView accessToken="tenant-a" />);
    expect((await screen.findAllByText("1,000")).length).toBeGreaterThan(0);
    expect(screen.queryByText("1.000")).not.toBeInTheDocument();
  });

  it("shows warning and critical levels", async () => {
    const fetchMock = stubRequests({
      ...volume,
      counts: { companies: 800, contacts: 0, opportunities: 0, activities: 0 },
      totalActiveRecords: 800,
      level: "warning",
    });
    render(<DashboardVolumeView accessToken="tenant-a" />);
    expect(
      await screen.findByText("Atenção: volume acima do limiar de observação.")
    ).toBeInTheDocument();
    expect(screen.getByText(/não bloqueiam cadastros/)).toBeInTheDocument();
    fetchMock.mockImplementation(async (url: string) =>
      response(
        url.endsWith("/dashboards/catalog")
          ? catalog
          : {
              ...volume,
              counts: {
                companies: 1000,
                contacts: 0,
                opportunities: 0,
                activities: 0,
              },
              totalActiveRecords: 1000,
              level: "critical",
            }
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Atualizar volume" }));
    expect(
      await screen.findByText(
        "Atenção: volume acima do limiar crítico de observação."
      )
    ).toBeInTheDocument();
  });

  it("clears counts on failure and retries", async () => {
    const fetchMock = stubRequests();
    render(<DashboardVolumeView accessToken="tenant-a" />);
    await screen.findByText("Empresas ativas");
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/dashboards/catalog")
        ? response(catalog)
        : response({ message: "Falha simulada" }, 500)
    );
    fireEvent.click(screen.getByRole("button", { name: "Atualizar volume" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha simulada"
    );
    expect(screen.queryByText("Empresas ativas")).not.toBeInTheDocument();
    fetchMock.mockImplementation(async (url: string) =>
      response(url.endsWith("/dashboards/catalog") ? catalog : volume)
    );
    fireEvent.click(screen.getByRole("button", { name: "Atualizar volume" }));
    expect(await screen.findByText("Empresas ativas")).toBeInTheDocument();
  });

  it("rejects inconsistent totals", async () => {
    stubRequests({ ...volume, totalActiveRecords: 999 });
    render(<DashboardVolumeView accessToken="tenant-a" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "totais inconsistentes"
    );
    expect(screen.queryByText("Empresas ativas")).not.toBeInTheDocument();
  });

  it("ignores delayed responses from other tenants", async () => {
    let resolveOld: ((value: Response) => void) | undefined;
    const mock = vi.fn((url: string, options?: RequestInit) => {
      const token = new Headers(options?.headers).get("Authorization");
      if (url.endsWith("/dashboards/catalog")) {
        return Promise.resolve(response(catalog));
      }
      if (token === "Bearer tenant-b") {
        return Promise.resolve(
          response({
            ...volume,
            counts: {
              companies: 9,
              contacts: 0,
              opportunities: 0,
              activities: 0,
            },
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
    expect((await screen.findAllByText("9")).length).toBeGreaterThan(0);
    resolveOld?.(
      response({
        ...volume,
        counts: {
          companies: 777,
          contacts: 0,
          opportunities: 0,
          activities: 0,
        },
        totalActiveRecords: 777,
      })
    );
    await waitFor(() =>
      expect(screen.queryByText("777")).not.toBeInTheDocument()
    );
    expect(screen.getAllByText("9").length).toBeGreaterThan(0);
  });

  it("compares successful refreshes only inside the same tenant session", async () => {
    const fetchMock = stubRequests();
    const { rerender } = render(<DashboardVolumeView accessToken="tenant-a" />);
    await screen.findByText("Empresas ativas");
    expect(
      screen.queryByText("Variação desde a consulta anterior")
    ).not.toBeInTheDocument();

    fetchMock.mockImplementation(async (url: string) =>
      response(
        url.endsWith("/dashboards/catalog")
          ? catalog
          : {
              ...volume,
              asOf: "2026-10-17T15:00:00.000Z",
              counts: {
                companies: 5,
                contacts: 2,
                opportunities: 1,
                activities: 4,
              },
              totalActiveRecords: 12,
            }
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Atualizar volume" }));
    const comparison = await screen.findByRole("region", {
      name: "Comparação com a última consulta da sessão",
    });
    expect(
      within(comparison).getByText("Variação desde a consulta anterior")
    ).toBeInTheDocument();
    expect(
      within(comparison).getByText(/Empresas ativas: \+2/)
    ).toBeInTheDocument();

    rerender(<DashboardVolumeView accessToken="tenant-b" />);
    await screen.findByText("Empresas ativas");
    expect(
      screen.queryByText("Variação desde a consulta anterior")
    ).not.toBeInTheDocument();
  });

  it("exports only the visible aggregate snapshot to a local CSV", async () => {
    stubRequests();
    const createObjectURL = vi.fn(() => "blob:local-dashboard");
    const revokeObjectURL = vi.fn();
    const oldCreate = URL.createObjectURL;
    const oldRevoke = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      render(<DashboardVolumeView accessToken="tenant-a" />);
      await screen.findByText("Empresas ativas");
      fireEvent.click(
        screen.getByRole("button", { name: "Exportar CSV de indicadores" })
      );
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-dashboard");
    } finally {
      click.mockRestore();
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: oldCreate,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: oldRevoke,
      });
    }
  });
});
