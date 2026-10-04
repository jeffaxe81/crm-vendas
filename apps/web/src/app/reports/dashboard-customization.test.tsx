import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementSummaryView } from "./management-summary-view";

const summary = {
  asOf: "2026-10-03T12:00:00.000Z",
  openEstimatedValue: "12500.50",
  pendingActivities: 7,
  overdueActivities: 2,
  undatedActivities: 1,
  opportunitiesByStage: [
    {
      pipelineId: "44444444-4444-4444-8444-444444444444",
      pipelineName: "Comercial",
      stageId: "55555555-5555-4555-8555-555555555555",
      stageName: "Proposta",
      count: 3,
    },
  ],
};
const bucket = { opportunities: 1, value: "1200.00" };
function setupFetch() {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const body = url.pathname.endsWith("management-summary")
      ? summary
      : {
          asOf: summary.asOf,
          filters: {
            year: Number(url.searchParams.get("year")),
            pipelineId: null,
          },
          items: Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            open: bucket,
            won: bucket,
            lost: bucket,
            total: bucket,
            winRate: "50.0",
          })),
          totals: {
            open: bucket,
            won: bucket,
            lost: bucket,
            total: bucket,
            winRate: "50.0",
          },
        };
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("CRM-F003 dashboard", () => {
  it("retains the chosen year after a failed summary refresh and retry", async () => {
    const fetchMock = setupFetch();
    const successfulFetch = fetchMock.getMockImplementation()!;
    render(<ManagementSummaryView accessToken="test-token" />);
    const select = await screen.findByLabelText("Ano do gráfico de vendas");
    const previous = String(new Date().getUTCFullYear() - 1);
    fireEvent.change(select, { target: { value: previous } });
    await waitFor(() =>
      expect(screen.queryByText("Carregando vendas...")).not.toBeInTheDocument()
    );
    fetchMock.mockImplementation(async input => {
      if (String(input).includes("management-summary"))
        throw new Error("Resumo indisponível");
      return successfulFetch(input);
    });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar painel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Resumo indisponível"
    );
    expect(screen.getByLabelText("Ano do gráfico de vendas")).toHaveValue(
      previous
    );
    fetchMock.mockImplementation(successfulFetch);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar painel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText("Ano do gráfico de vendas")).toHaveValue(
      previous
    );
  });
  it("keeps customization usable when browser storage is unavailable", async () => {
    setupFetch();
    render(
      <ManagementSummaryView
        accessToken="test-token"
        preferenceScope="org-a:user-a"
      />
    );
    await screen.findByText("R$ 12.500,50");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Personalizar painel" })
    );
    fireEvent.click(screen.getByLabelText("Exibir Valor em aberto"));
    expect(screen.queryByText("R$ 12.500,50")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "não foi possível salvar"
    );
  });
  it("supports an empty layout with an accessible way to restore it", async () => {
    setupFetch();
    render(<ManagementSummaryView accessToken="test-token" />);
    await screen.findByText("R$ 12.500,50");
    fireEvent.click(
      screen.getByRole("button", { name: "Personalizar painel" })
    );
    for (const input of screen.getAllByRole("checkbox")) fireEvent.click(input);
    expect(
      screen.getByText(/Nenhum componente selecionado/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar padrão" }));
    expect(screen.getByText("R$ 12.500,50")).toBeInTheDocument();
  });
  it("shows chart errors independently of summary metrics", async () => {
    const fetchMock = setupFetch();
    fetchMock.mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (!path.endsWith("management-summary"))
        throw new Error("Vendas indisponíveis");
      return { ok: true, status: 200, json: async () => summary } as Response;
    });
    render(<ManagementSummaryView accessToken="test-token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vendas indisponíveis"
    );
    expect(screen.getByText("R$ 12.500,50")).toBeInTheDocument();
  });

  it("persists layout for one user and organization without affecting another", async () => {
    setupFetch();
    const first = render(
      <ManagementSummaryView
        accessToken="test-token"
        preferenceScope="org-a:user-a"
      />
    );
    await screen.findByText("R$ 12.500,50");
    fireEvent.click(
      screen.getByRole("button", { name: "Personalizar painel" })
    );
    fireEvent.click(screen.getByLabelText("Exibir Valor em aberto"));
    first.unmount();
    const second = render(
      <ManagementSummaryView
        accessToken="test-token"
        preferenceScope="org-a:user-a"
      />
    );
    await screen.findByRole("button", { name: "Personalizar painel" });
    await waitFor(() =>
      expect(screen.queryByText("R$ 12.500,50")).not.toBeInTheDocument()
    );
    second.unmount();
    render(
      <ManagementSummaryView
        accessToken="test-token"
        preferenceScope="org-b:user-a"
      />
    );
    expect(await screen.findByText("R$ 12.500,50")).toBeInTheDocument();
    expect(localStorage.getItem("crm:dashboard:v1:org-a:user-a")).not.toContain(
      "test-token"
    );
  });
  it.each(["bad JSON", '{"order":["unknown"],"hidden":[]}'])(
    "recovers from invalid saved preferences: %s",
    saved => {
      localStorage.setItem("crm:dashboard:v1:org-a:user-a", saved);
      setupFetch();
      render(
        <ManagementSummaryView
          accessToken="test-token"
          preferenceScope="org-a:user-a"
        />
      );
      return screen.findByText("R$ 12.500,50").then(element => {
        expect(element).toBeInTheDocument();
      });
    }
  );
  it("keeps the chosen chart year when refreshing the dashboard", async () => {
    const fetchMock = setupFetch();
    render(<ManagementSummaryView accessToken="test-token" />);
    const select = await screen.findByLabelText("Ano do gráfico de vendas");
    const previous = String(new Date().getUTCFullYear() - 1);
    fireEvent.change(select, { target: { value: previous } });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes(`year=${previous}`)
        )
      ).toBe(true)
    );
    fireEvent.click(screen.getByRole("button", { name: "Atualizar painel" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Ano do gráfico de vendas")).toHaveValue(
        previous
      )
    );
  });

  it("hides a metric and restores it using default layout", async () => {
    setupFetch();
    render(<ManagementSummaryView accessToken="test-token" />);
    await screen.findByText("R$ 12.500,50");
    fireEvent.click(
      screen.getByRole("button", { name: "Personalizar painel" })
    );
    fireEvent.click(screen.getByLabelText("Exibir Valor em aberto"));
    expect(screen.queryByText("R$ 12.500,50")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar padrão" }));
    expect(screen.getByText("R$ 12.500,50")).toBeInTheDocument();
  });
  it("moves a metric using accessible controls", async () => {
    setupFetch();
    render(<ManagementSummaryView accessToken="test-token" />);
    await screen.findByText("R$ 12.500,50");
    fireEvent.click(
      screen.getByRole("button", { name: "Personalizar painel" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mover Valor em aberto para baixo" })
    );
    const widgets = screen.getByLabelText("Componentes do dashboard");
    expect(widgets.children[0]).toHaveTextContent("Atividades pendentes");
  });
  it("opens the existing report from a metric", async () => {
    setupFetch();
    render(<ManagementSummaryView accessToken="test-token" />);
    await screen.findByText("R$ 12.500,50");
    fireEvent.click(
      screen.getByRole("button", { name: "Ver relatório de Valor em aberto" })
    );
    expect(screen.getByRole("tab", { name: "Funil" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
  it("refreshes summary data", async () => {
    const fetchMock = setupFetch();
    render(<ManagementSummaryView accessToken="test-token" />);
    await screen.findByText("R$ 12.500,50");
    fireEvent.click(screen.getByRole("button", { name: "Atualizar painel" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).includes("management-summary")
        ).length
      ).toBe(2)
    );
  });
  it("shows a monthly won-sales chart with explicit year and values", async () => {
    setupFetch();
    render(<ManagementSummaryView accessToken="test-token" />);
    const chart = await screen.findByRole("region", {
      name: "Vendas ganhas por mês",
    });
    expect(await within(chart).findAllByText("R$ 1.200,00")).toHaveLength(12);
    expect(
      within(chart).getByLabelText("Ano do gráfico de vendas")
    ).toHaveValue(String(new Date().getUTCFullYear()));
  });
});
