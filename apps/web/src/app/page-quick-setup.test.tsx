import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import Home from "./page";

vi.mock("./crm-shell", () => ({
  CrmShell: ({
    children,
    onOpenQuickSetup,
  }: {
    children: ReactNode;
    onOpenQuickSetup?: () => void;
  }) => (
    <div>
      <button type="button" onClick={onOpenQuickSetup}>
        Configuração rápida
      </button>
      {children}
    </div>
  ),
}));

vi.mock("./workspace/workspace-provider", () => ({
  WorkspaceProvider: ({ children }: { children: ReactNode }) => children,
  useWorkspace: () => null,
}));

vi.mock("./workspace/workspace-home", () => ({
  WorkspaceHome: () => <p>Home pronta</p>,
}));

vi.mock("./workspace/first-access-experience", () => ({
  FirstAccessExperience: () => null,
}));

vi.mock("./workspace/quick-setup-experience", () => ({
  QuickSetupExperience: ({ openToken }: { openToken: number }) => (
    <output aria-label="Token da configuração rápida">{openToken}</output>
  ),
}));

const session = {
  accessToken: "quick-page-token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.test",
    displayName: "Admin",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Empresa Demo",
    slug: "empresa-demo",
  },
  membership: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "ADMIN",
  },
  permissions: ["organization.manage", "user.manage", "company.read"],
};

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

describe("CRM 1.2 quick setup page integration", () => {
  it("mounts the experience and reopens it from the authenticated shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("/auth/refresh")) return response({}, 401);
        if (url.endsWith("/auth/login")) return response(session);
        throw new Error(`Unexpected request: ${url}`);
      })
    );

    render(<Home />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: session.user.email },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "synthetic-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no CRM" }));

    expect(
      await screen.findByLabelText("Token da configuração rápida")
    ).toHaveTextContent("0");

    fireEvent.click(
      screen.getByRole("button", { name: "Configuração rápida" })
    );

    expect(
      screen.getByLabelText("Token da configuração rápida")
    ).toHaveTextContent("1");
  });
});
