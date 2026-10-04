import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorkspacePreferences } from "@axes/contracts";
import Home from "../page";
const session = {
  accessToken: "token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "ana@example.test",
    displayName: "Ana",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Empresa",
    slug: "empresa",
  },
  membership: { id: "33333333-3333-4333-8333-333333333333", role: "ADMIN" },
  permissions: ["company.read"],
};
const response = (value: unknown) =>
  ({ ok: true, status: 200, json: async () => value }) as Response;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Workspace start page", () => {
  it("does not query hidden widgets before or after preferences load", async () => {
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("auth/refresh"))
        return response({
          ...session,
          permissions: ["activity.read", "reports.read"],
        });
      if (url.endsWith("workspace-preferences"))
        return new Promise<Response>(done => {
          resolve = done;
        });
      return response({ items: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);
    await screen.findByRole("heading", { name: "Olá, Ana" });
    expect(
      fetchMock.mock.calls
        .map(call => String(call[0]))
        .filter(
          url =>
            !url.endsWith("auth/refresh") &&
            !url.endsWith("workspace-preferences")
        )
    ).toEqual([]);
    resolve(
      response({
        ...createDefaultWorkspacePreferences(),
        homeHidden: ["today", "indicators"],
      })
    );
    await screen.findByText("Escolha seus atalhos em Personalizar início.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("opens the related report from a home indicator", async () => {
    const summary = {
      asOf: "2026-10-04T00:00:00.000Z",
      opportunitiesByStage: [],
      openEstimatedValue: "500.00",
      pendingActivities: 0,
      overdueActivities: 0,
      undatedActivities: 0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("auth/refresh"))
          return response({ ...session, permissions: ["reports.read"] });
        if (url.endsWith("workspace-preferences"))
          return response({
            ...createDefaultWorkspacePreferences(),
            homeHidden: ["today"],
            dashboardHidden: ["sales"],
          });
        return response(summary);
      })
    );
    render(<Home />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver relatório de Valor em aberto",
      })
    );
    expect(screen.getByRole("tab", { name: "Funil" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
  it("keeps manual navigation after preferences arrive late", async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("auth/refresh")) return response(session);
        if (url.endsWith("workspace-preferences"))
          return new Promise<Response>(done => {
            resolve = done;
          });
        return response({ items: [], page: 1, limit: 20, total: 0 });
      })
    );
    render(<Home />);
    expect(
      await screen.findByRole("heading", { name: "Olá, Ana" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Pendentes de hoje")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Grupo Comercial" }));
    fireEvent.click(screen.getByRole("button", { name: "Empresas" }));
    await screen.findByRole("heading", { name: "Empresas" });
    resolve(response(createDefaultWorkspacePreferences()));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Empresas" })
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("heading", { name: "Olá, Ana" })
    ).not.toBeInTheDocument();
  });
  it("opens a saved allowed section and does not expose admin pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).endsWith("auth/refresh")
          ? response(session)
          : String(input).endsWith("workspace-preferences")
            ? response({
                ...createDefaultWorkspacePreferences(),
                defaultSection: "companies",
              })
            : response({ items: [], page: 1, limit: 20, total: 0 })
      )
    );
    render(<Home />);
    expect(
      await screen.findByRole("heading", { name: "Empresas" })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Grupo Administração" })
    );
    expect(
      screen.queryByRole("button", { name: "Usuários e perfis" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preferências pessoais" })
    ).toBeInTheDocument();
  });
});
